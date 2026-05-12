const fs = require('fs');
const bs58 = require('bs58').default;

const secret = "YOUR_PRIVATE_KEY_HERE";

const decoded = bs58.decode(secret);

fs.writeFileSync(
  'treasury-wallet.json',
  JSON.stringify(Array.from(decoded))
);

console.log("wallet exported");