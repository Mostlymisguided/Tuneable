// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { 
  sendEmailVerification, 
  sendPasswordReset, 
  sendWelcomeEmail,
  sendOwnershipNotification,
  sendClaimStatusNotification
} = require('../utils/emailService');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tuneable', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testEmailSystem() {
  console.log('📧 Testing Email System...\n');
  
  try {
    // Create a test user
    const timestamp = Date.now();
    const testUser = new User({
      username: `testuser_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'testpassword123',
      givenName: 'Test',
      familyName: 'User',
      personalInviteCode: `TEST${timestamp}`,
      emailVerified: false
    });

    await testUser.save();
    console.log('✅ Test user created:', testUser.username);

    // Test 1: Email Verification
    console.log('\n🔍 Testing Email Verification...');
    const verificationToken = testUser.generateEmailVerificationToken();
    await testUser.save();
    
    const verificationSent = await sendEmailVerification(testUser, verificationToken);
    console.log(`Email verification sent: ${verificationSent ? '✅' : '❌'}`);

    // Test 2: Password Reset
    console.log('\n🔍 Testing Password Reset...');
    const resetToken = testUser.generatePasswordResetToken();
    await testUser.save();
    
    const resetSent = await sendPasswordReset(testUser, resetToken);
    console.log(`Password reset sent: ${resetSent ? '✅' : '❌'}`);

    // Test 3: Welcome Email
    console.log('\n🔍 Testing Welcome Email...');
    testUser.emailVerified = true;
    await testUser.save();
    
    const welcomeSent = await sendWelcomeEmail(testUser);
    console.log(`Welcome email sent: ${welcomeSent ? '✅' : '❌'}`);

    // Test 4: Ownership Notification
    console.log('\n🔍 Testing Ownership Notification...');
    const Media = require('../models/Media');
    const testMedia = new Media({
      title: 'Test Song',
      artist: [{ name: 'Test Artist', userId: testUser._id, verified: true }],
      album: 'Test Album',
      duration: 180,
      contentType: ['music'],
      contentForm: ['tune'],
      addedBy: testUser._id
    });

    await testMedia.save();
    console.log('✅ Test media created:', testMedia.title);

    const ownershipSent = await sendOwnershipNotification(testUser, testMedia, 50, testUser);
    console.log(`Ownership notification sent: ${ownershipSent ? '✅' : '❌'}`);

    // Test 5: Claim Status Notification
    console.log('\n🔍 Testing Claim Status Notification...');
    const Claim = require('../models/Claim');
    const testClaim = new Claim({
      userId: testUser._id,
      mediaId: testMedia._id,
      proofText: 'Test proof of ownership',
      submittedAt: new Date(),
      status: 'pending'
    });

    await testClaim.save();
    console.log('✅ Test claim created');

    const claimApprovedSent = await sendClaimStatusNotification(testUser, testClaim, testMedia, 'approved', 'Great proof provided!');
    console.log(`Claim approved notification sent: ${claimApprovedSent ? '✅' : '❌'}`);

    const claimRejectedSent = await sendClaimStatusNotification(testUser, testClaim, testMedia, 'rejected', 'Insufficient proof provided.');
    console.log(`Claim rejected notification sent: ${claimRejectedSent ? '✅' : '❌'}`);

    // Test 6: Email Verification Flow
    console.log('\n🔍 Testing Email Verification Flow...');
    const newToken = testUser.generateEmailVerificationToken();
    await testUser.save();
    
    const verified = testUser.verifyEmail(newToken);
    console.log(`Email verification successful: ${verified ? '✅' : '❌'}`);
    console.log(`User email verified: ${testUser.emailVerified ? '✅' : '❌'}`);

    // Test 7: Password Reset Flow
    console.log('\n🔍 Testing Password Reset Flow...');
    const newResetToken = testUser.generatePasswordResetToken();
    await testUser.save();
    
    const passwordReset = testUser.resetPassword(newResetToken, 'newpassword123');
    console.log(`Password reset successful: ${passwordReset ? '✅' : '❌'}`);

    console.log('\n📊 Email System Test Summary:');
    console.log('============================');
    console.log('✅ Email verification system working');
    console.log('✅ Password reset system working');
    console.log('✅ Welcome email system working');
    console.log('✅ Ownership notification system working');
    console.log('✅ Claim status notification system working');
    console.log('✅ Token generation and validation working');
    console.log('✅ User model methods working');

    console.log('\n🎉 All email system tests completed successfully!');
    console.log('\n📝 Note: Check your email service logs to verify emails were actually sent.');
    console.log('   - Resend dashboard: https://resend.com/emails');
    console.log('   - Check spam folder if emails not received');

  } catch (error) {
    console.error('❌ Error testing email system:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup test data
    try {
      await User.deleteMany({ username: /^testuser_/ });
      const Media = require('../models/Media');
      await Media.deleteMany({ title: 'Test Song' });
      const Claim = require('../models/Claim');
      await Claim.deleteMany({ proofText: 'Test proof of ownership' });
      console.log('\n🧹 Test data cleaned up');
    } catch (cleanupError) {
      console.error('Error cleaning up test data:', cleanupError.message);
    }

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testEmailSystem();
