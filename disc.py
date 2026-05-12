import hashlib

def disc(ns, name):
    return hashlib.sha256(f"{ns}:{name}".encode()).digest()[:8]

items = [
    ('global', 'initialize_escrow'),
    ('global', 'deposit'),
    ('global', 'release'),
    ('account', 'EscrowAccount'),
    ('event', 'EscrowInitialized'),
    ('event', 'EscrowDeposited'),
    ('event', 'EscrowReleased')
]

for ns, name in items:
    print(f"{ns}:{name} {list(disc(ns, name))}")