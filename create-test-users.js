const auth = require('./src/backend/auth');

async function createAdminUser() {
  try {
    console.log('Initializing auth database...');
    await auth.initializeDatabase();
    
    console.log('Creating admin user...');
    const adminUser = await auth.createDirectUser(
      'admin@pfnonwovens.com',
      'Admin User',
      'Admin@123'
    );
    
    console.log('✓ Admin user created successfully');
    console.log('  Email: admin@pfnonwovens.com');
    console.log('  Password: Admin@123');
    console.log(`  ID: ${adminUser.id}`);
    
    // Create a regular user
    const regularUser = await auth.createDirectUser(
      'user@pfnonwovens.com',
      'Regular User',
      'User@1234'
    );
    
    console.log('\n✓ Regular user created successfully');
    console.log('  Email: user@pfnonwovens.com');
    console.log('  Password: User@1234');
    console.log(`  ID: ${regularUser.id}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

createAdminUser();
