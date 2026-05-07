use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("HukqmD9GfmVya8ASPrY7ELEmuJXy8PxA4Mvm7PsQEjgE");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        invoice_id: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        escrow.authority = ctx.accounts.authority.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.amount = 0;
        escrow.is_released = false;
        escrow.bump = ctx.bumps.escrow;
        escrow.invoice_id = invoice_id;

        emit!(EscrowInitialized {
            authority: escrow.authority,
            invoice_id,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require_keys_eq!(
            ctx.accounts.user.key(),
            escrow.authority,
            EscrowError::InvalidAuthority
        );
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(!escrow.is_released, EscrowError::AlreadyReleased);

        token::transfer(ctx.accounts.transfer_to_vault_context(), amount)?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.amount = escrow
            .amount
            .checked_add(amount)
            .ok_or(error!(EscrowError::InvalidAmount))?;

        emit!(EscrowDeposited {
            authority: escrow.authority,
            amount,
        });

        Ok(())
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require_keys_eq!(
            ctx.accounts.authority.key(),
            escrow.authority,
            EscrowError::Unauthorized
        );
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(escrow.amount > 0, EscrowError::InvalidAmount);

        let amount = escrow.amount;
        let authority_key = escrow.authority;
        let invoice_id = escrow.invoice_id;
        let bump = escrow.bump;
        let signer_seeds: &[&[u8]] = &[
            b"escrow",
            authority_key.as_ref(),
            invoice_id.as_ref(),
            &[bump],
        ];

        token::transfer(
            ctx.accounts
                .transfer_to_contractor_context()
                .with_signer(&[signer_seeds]),
            amount,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_released = true;
        escrow.amount = 0;

        emit!(EscrowReleased {
            contractor: ctx.accounts.contractor.key(),
            amount,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(invoice_id: [u8; 32])]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = authority,
        space = EscrowAccount::SPACE,
        seeds = [b"escrow", authority.key().as_ref(), invoice_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = escrow
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.authority.as_ref(),
            escrow.invoice_id.as_ref()
        ],
        bump = escrow.bump,
        has_one = mint,
        has_one = vault
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == escrow.mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = vault.key() == escrow.vault,
        constraint = vault.mint == escrow.mint
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

impl<'info> Deposit<'info> {
    fn transfer_to_vault_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let accounts = Transfer {
            from: self.user_token_account.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.user.to_account_info(),
        };

        CpiContext::new(self.token_program.to_account_info(), accounts)
    }
}

#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"escrow",
            escrow.authority.as_ref(),
            escrow.invoice_id.as_ref()
        ],
        bump = escrow.bump,
        has_one = mint,
        has_one = vault
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = vault.key() == escrow.vault,
        constraint = vault.mint == escrow.mint
    )]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: The contractor only receives tokens through its associated token account.
    pub contractor: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = contractor
    )]
    pub contractor_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

impl<'info> Release<'info> {
    fn transfer_to_contractor_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let accounts = Transfer {
            from: self.vault.to_account_info(),
            to: self.contractor_token_account.to_account_info(),
            authority: self.escrow.to_account_info(),
        };

        CpiContext::new(self.token_program.to_account_info(), accounts)
    }
}

#[account]
pub struct EscrowAccount {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub is_released: bool,
    pub bump: u8,
    pub invoice_id: [u8; 32],
}

impl EscrowAccount {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 8 + 1 + 1 + 32;
}

#[event]
pub struct EscrowInitialized {
    pub authority: Pubkey,
    pub invoice_id: [u8; 32],
}

#[event]
pub struct EscrowDeposited {
    pub authority: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowReleased {
    pub contractor: Pubkey,
    pub amount: u64,
}

#[error_code]
pub enum EscrowError {
    #[msg("Only the escrow authority can release funds.")]
    Unauthorized,

    #[msg("Escrow funds have already been released.")]
    AlreadyReleased,

    #[msg("Amount must be greater than zero and fit safely in escrow state.")]
    InvalidAmount,

    #[msg("Signer does not match the escrow authority.")]
    InvalidAuthority,
}
