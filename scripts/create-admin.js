#!/usr/bin/env node

const bcrypt = require('bcrypt');
const readline = require('readline');
const path = require('path');

// Load database and repositories
const { initialize } = require('../src/database/index');
const { initializeSchema } = require('../src/database/schema');
const adminUserRepo = require('../src/database/repositories/admin-user-repo');

const BCRYPT_COST_FACTOR = 12;

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validatePassword(password) {
  const errors = [];

  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateUsername(username) {
  const errors = [];

  if (!username || username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username && username.length > 50) {
    errors.push('Username must be less than 50 characters');
  }

  if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Prompt for input from the user
 * @param {string} question - Question to ask
 * @param {boolean} hidden - Hide input (for passwords)
 * @returns {Promise<string>} User input
 */
function prompt(question, hidden = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    if (hidden) {
      // Hide password input
      rl.question(question, (answer) => {
        rl.close();
        console.log(); // Add newline after hidden input
        resolve(answer);
      });
      rl._writeToOutput = function _writeToOutput(stringToWrite) {
        if (stringToWrite.charCodeAt(0) === 13) {
          rl.output.write('\n');
        } else if (stringToWrite === question) {
          rl.output.write(stringToWrite);
        } else {
          rl.output.write('*');
        }
      };
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Main function to create admin user
 */
async function main() {
  console.log('Saloon Bot - Admin User Creation\n');

  let username = process.argv[2];
  let password = process.argv[3];

  // Interactive mode if no arguments provided
  if (!username || !password) {
    console.log('Interactive mode: Enter admin credentials\n');

    // Get username
    username = await prompt('Username: ');
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      console.error('\nUsername validation failed:');
      usernameValidation.errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    // Get password
    password = await prompt('Password: ', true);
    const passwordConfirm = await prompt('Confirm Password: ', true);

    if (password !== passwordConfirm) {
      console.error('\nError: Passwords do not match');
      process.exit(1);
    }
  }

  // Validate username
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    console.error('Username validation failed:');
    usernameValidation.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    console.error('Password validation failed:');
    passwordValidation.errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPassword requirements:');
    console.error('  - Minimum 12 characters');
    console.error('  - At least one uppercase letter');
    console.error('  - At least one lowercase letter');
    console.error('  - At least one number');
    process.exit(1);
  }

  try {
    // Initialize database
    console.log('\nInitializing database...');
    initialize();
    await initializeSchema();

    // Check if user already exists
    const existingUser = adminUserRepo.findByUsername(username);
    if (existingUser) {
      console.error(`\nError: Admin user "${username}" already exists`);
      process.exit(1);
    }

    // Hash password
    console.log('Hashing password...');
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

    // Create admin user
    console.log('Creating admin user...');
    const user = adminUserRepo.create(username, passwordHash);

    console.log('\nSuccess! Admin user created:');
    console.log(`  Username: ${user.username}`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Created: ${user.created_at}`);
    console.log('\nYou can now log in to the admin interface with these credentials.');

  } catch (error) {
    console.error('\nError creating admin user:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
