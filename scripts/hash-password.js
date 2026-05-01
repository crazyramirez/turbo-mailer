import bcrypt from 'bcryptjs';
import readline from 'readline';

const args = process.argv.slice(2);
const passwordArg = args[0];

if (passwordArg) {
  const hash = bcrypt.hashSync(passwordArg, 10);
  console.log('\n--- HASH GENERATED ---');
  console.log(hash);
  console.log('----------------------\n');
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Introduce la contraseña que deseas hashear: ', (answer) => {
  if (!answer) {
    console.error('La contraseña no puede estar vacía.');
    rl.close();
    process.exit(1);
  }

  const hash = bcrypt.hashSync(answer, 10);
  console.log('\n--- HASH GENERATED ---');
  console.log(hash);
  console.log('----------------------\n');

  rl.close();
});
