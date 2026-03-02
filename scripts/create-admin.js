/**
 * Create Admin User - mfischer@pfnonwovens.com
 * Usage: node scripts/create-admin.js
 */

const auth = require('../src/backend/auth');

async function main() {
  try {
    console.log('\n========================================');
    console.log('   Creating Admin User');
    console.log('========================================\n');

    // Initialize database
    await auth.initializeDatabase();
    console.log('✓ Database initialized');

    // Create admin user
    try {
      const user = await auth.createUser(
        'mfischer@pfnonwovens.com',
        'Martin Fischer',
        'admin326',
        'admin'
      );

      console.log('\n✓ Admin user created successfully!');
      console.log('\nAdmin Credentials:');
      console.log('  Email: mfischer@pfnonwovens.com');
      console.log('  Password: admin326');
      console.log(`  Role: ${user.role}`);
    } catch (err) {
      if (err.message.includes('already in use')) {
        console.log('\n✓ Admin user already exists');
      } else {
        throw err;
      }
    }

    console.log('\n✓ Setup complete!\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

main();
