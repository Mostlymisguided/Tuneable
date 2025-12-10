const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SoundCloudStrategy = require('passport-soundcloud').Strategy;
const InstagramStrategy = require('passport-instagram-graph').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Facebook OAuth Strategy - only configure if environment variables are available
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:8000/api/auth/facebook/callback",
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
      passReqToCallback: true  // Enable passing req to callback for session access
    },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log('Facebook profile:', profile);
      
      // Check if this is an account linking request
      const isLinkingAccount = req.session?.linkAccount === true;
      const linkingUserId = req.session?.linkingUserId;
      
      // Check if user already exists with this Facebook ID
      let user = await User.findOne({ facebookId: profile.id });
      
      if (user) {
        // If linking account and the Facebook account is already linked to a different user
        if (isLinkingAccount && linkingUserId) {
          if (user._id.toString() !== linkingUserId) {
            // Facebook account is already linked to a different user
            return done(new Error('This Facebook account is already linked to another user account. Please use a different account.'), null);
          }
          // Facebook account is already linked to the current user - just update tokens
          user.facebookAccessToken = accessToken;
          user.oauthVerified = user.oauthVerified || {};
          user.oauthVerified.facebook = true;
          await user.save();
          return done(null, user);
        }
        
        // Not linking - just log in as the existing user
        user.facebookAccessToken = accessToken;
        user.oauthVerified = user.oauthVerified || {};
        user.oauthVerified.facebook = true; // Mark Facebook OAuth as verified
        
        // Update profile picture if user doesn't have one
        if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
          // Request larger image by modifying the URL to 400x400
          let photoUrl = profile.photos[0].value;
          photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
          user.profilePic = photoUrl;
        }
        
        // Update names from Facebook only if not already set
        if (profile.name) {
          if (profile.name.givenName && !user.givenName) {
            user.givenName = profile.name.givenName;
          }
          if (profile.name.familyName && !user.familyName) {
            user.familyName = profile.name.familyName;
          }
        }
        
        // Update last login time
        user.lastLoginAt = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Check if user exists with the same email
      if (profile.emails && profile.emails.length > 0) {
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // If linking account, verify the email matches the current user
          if (isLinkingAccount && linkingUserId) {
            if (user._id.toString() !== linkingUserId) {
              // Email matches a different user - don't link, return error
              return done(new Error('This email is already associated with another account. Please use a different Facebook account or contact support.'), null);
            }
            // Email matches current user - link Facebook account
            const isFirstFacebookLink = !user.facebookId;
            user.facebookId = profile.id;
            user.facebookAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.facebook = true;
            
            // Update profile picture if user doesn't have one or is linking Facebook for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstFacebookLink)) {
              let photoUrl = profile.photos[0].value;
              photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
              user.profilePic = photoUrl;
            }
            
            // Update names from Facebook only if not already set
            if (profile.name) {
              if (profile.name.givenName && !user.givenName) {
                user.givenName = profile.name.givenName;
              }
              if (profile.name.familyName && !user.familyName) {
                user.familyName = profile.name.familyName;
              }
            }
            
            user.lastLoginAt = new Date();
            await user.save();
            return done(null, user);
          }
          
          // Not linking - link Facebook account to existing user by email
          const isFirstFacebookLink = !user.facebookId;
          user.facebookId = profile.id;
          user.facebookAccessToken = accessToken;
          user.oauthVerified = user.oauthVerified || {};
          user.oauthVerified.facebook = true; // Mark Facebook OAuth as verified
          
          // Update profile picture if user doesn't have one or is linking Facebook for first time
          if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstFacebookLink)) {
            // Request larger image by modifying the URL to 400x400
            let photoUrl = profile.photos[0].value;
            photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
            user.profilePic = photoUrl;
          }
          
          // Update names from Facebook only if not already set
          if (profile.name) {
            if (profile.name.givenName && !user.givenName) {
              user.givenName = profile.name.givenName;
            }
            if (profile.name.familyName && !user.familyName) {
              user.familyName = profile.name.familyName;
            }
          }
          
          // Update last login time
          user.lastLoginAt = new Date();
          await user.save();
          return done(null, user);
        }
      }
      
      // If linking account but no user found by email or Facebook ID, link to current user
      if (isLinkingAccount && linkingUserId) {
        const currentUser = await User.findById(linkingUserId);
        if (!currentUser) {
          return done(new Error('User session expired. Please log in again.'), null);
        }
        
        // Link Facebook account to current user
        currentUser.facebookId = profile.id;
        currentUser.facebookAccessToken = accessToken;
        currentUser.oauthVerified = currentUser.oauthVerified || {};
        currentUser.oauthVerified.facebook = true;
        
        // Update profile picture if user doesn't have one
        if (profile.photos && profile.photos.length > 0 && !currentUser.profilePic) {
          let photoUrl = profile.photos[0].value;
          photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
          currentUser.profilePic = photoUrl;
        }
        
        await currentUser.save();
        return done(null, currentUser);
      }
      
      // Create new user
      // Check for invite code in session (passed from OAuth initiation)
      let parentInviteCode = null;
      let inviter = null;
      let inviteCodeObj = null;
      if (req && req.session && req.session.pendingInviteCode) {
        const code = req.session.pendingInviteCode;
        // Validate invite code using new helper method
        inviter = await User.findByInviteCode(code);
        if (inviter) {
          parentInviteCode = code.toUpperCase();
          inviteCodeObj = inviter.findInviteCodeObject(code);
        }
      }
      
      // Require invite code for new users
      if (!parentInviteCode || !inviter) {
        return done(new Error('Valid invite code required to create account'), null);
      }
      
      // Check if code is active
      if (inviteCodeObj && !inviteCodeObj.isActive) {
        return done(new Error('This invite code has been deactivated'), null);
      }
      
      // Check if inviter has invite credits (admins have unlimited credits)
      const isInviterAdmin = inviter.role && inviter.role.includes('admin');
      if (!isInviterAdmin) {
        // Check if inviter has invite credits
        if (!inviter.inviteCredits || inviter.inviteCredits <= 0) {
          return done(new Error('This invite code has no remaining invites'), null);
        }
      }
      
      const emailValue = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
      const usernameValue = (profile.name.givenName + profile.name.familyName + Math.random().toString(36).substr(2, 4)).replace(/\s+/g, '');
      
      console.log('Creating new user with:', {
        facebookId: profile.id,
        email: emailValue,
        username: usernameValue,
        givenName: profile.name.givenName,
        familyName: profile.name.familyName
      });
      
      // Get high-res profile picture
      let profilePicUrl = null;
      if (profile.photos && profile.photos.length > 0) {
        profilePicUrl = profile.photos[0].value;
        profilePicUrl = profilePicUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
      }

      const newInviteCode = generateInviteCode();
      const newUser = new User({
        facebookId: profile.id,
        facebookAccessToken: accessToken,
        email: emailValue,
        username: usernameValue,
        givenName: profile.name.givenName,
        familyName: profile.name.familyName,
        profilePic: profilePicUrl,
        isActive: true,
        role: ['user'],
        balance: 0,
        // Generate invite codes - both old and new format
        personalInviteCode: newInviteCode, // Keep for backward compatibility
        personalInviteCodes: [{
          code: newInviteCode,
          isActive: true,
          label: 'Primary',
          createdAt: new Date(),
          usageCount: 0
        }],
        parentInviteCode: parentInviteCode,
        parentInviteCodeId: inviteCodeObj && inviteCodeObj._id ? inviteCodeObj._id : null,
        // Mark Facebook OAuth as verified
        oauthVerified: {
          facebook: true,
          instagram: false,
          soundcloud: false,
          google: false
        },
        lastLoginAt: new Date()
      });
      
      await newUser.save();
      
      // Increment usage count for the invite code that was used
      if (inviteCodeObj && inviteCodeObj._id && inviter.personalInviteCodes) {
        const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic._id && ic._id.toString() === inviteCodeObj._id.toString());
        if (codeIndex !== -1) {
          inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
          await inviter.save();
        }
      } else if (inviter.personalInviteCode === parentInviteCode) {
        // Legacy code handling
        if (!inviter.personalInviteCodes || inviter.personalInviteCodes.length === 0) {
          inviter.personalInviteCodes = [{
            code: inviter.personalInviteCode,
            isActive: true,
            label: 'Primary',
            createdAt: inviter.createdAt || new Date(),
            usageCount: 1
          }];
        } else {
          const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic.code === parentInviteCode);
          if (codeIndex !== -1) {
            inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
          }
        }
        await inviter.save();
      }
      
      // Give beta users £1.11 credit on sign up
      try {
        const { giveBetaSignupCredit } = require('../utils/betaCreditHelper');
        await giveBetaSignupCredit(newUser);
      } catch (betaCreditError) {
        console.error('Failed to give beta signup credit:', betaCreditError);
        // Don't fail registration if beta credit fails
      }
      
      // Decrement inviter's invite credits (unless admin - admins have unlimited)
      if (!isInviterAdmin && inviter.inviteCredits > 0) {
        inviter.inviteCredits -= 1;
        await inviter.save();
        console.log(`✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`);
      }
      
      // Auto-join new OAuth user to Global Party
      try {
        const Party = require('../models/Party');
        const globalParty = await Party.getGlobalParty();
        if (globalParty && !globalParty.partiers.includes(newUser._id)) {
          // Add user to Global Party's partiers array
          globalParty.partiers.push(newUser._id);
          await globalParty.save();
          
          // Add Global Party to user's joinedParties array
          newUser.joinedParties.push({
            partyId: globalParty._id, // Using ObjectId directly
            role: 'partier'
          });
          await newUser.save();
          
          console.log('✅ Auto-joined new OAuth user to Global Party:', newUser.username);
        }
      } catch (globalPartyError) {
        console.error('Failed to auto-join OAuth user to Global Party:', globalPartyError);
        // Don't fail OAuth registration if Global Party join fails
      }
      
      return done(null, newUser);
      
    } catch (error) {
      console.error('Facebook OAuth error:', error);
      return done(error, null);
    }
  }
  ));
} else {
  console.log('⚠️  Facebook OAuth not configured - FACEBOOK_APP_ID or FACEBOOK_APP_SECRET missing');
}

// Google OAuth Strategy - only configure if environment variables are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:8000/api/auth/google/callback",
      passReqToCallback: true  // Required to access req object in callback for state validation
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google profile:', profile);
        
        // Check if this is an account linking request
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          // If linking account and the Google account is already linked to a different user
          if (isLinkingAccount && linkingUserId) {
            if (user._id.toString() !== linkingUserId) {
              // Google account is already linked to a different user
              return done(new Error('This Google account is already linked to another user account. Please use a different account.'), null);
            }
            // Google account is already linked to the current user - just update tokens
            user.googleAccessToken = accessToken;
            user.googleRefreshToken = refreshToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.google = true;
            await user.save();
            return done(null, user);
          }
          
          // Not linking - just log in as the existing user
          // User exists, update their Google tokens
          user.googleAccessToken = accessToken;
          user.googleRefreshToken = refreshToken;
          user.oauthVerified = user.oauthVerified || {};
          user.oauthVerified.google = true; // Mark Google OAuth as verified
          
          // Update profile picture from Google only if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            let photoUrl = profile.photos[0].value;
            photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
            user.profilePic = photoUrl;
          }
          
          // Update names from Google only if not already set
          if (profile.name) {
            if (profile.name.givenName && !user.givenName) {
              user.givenName = profile.name.givenName;
            }
            if (profile.name.familyName && !user.familyName) {
              user.familyName = profile.name.familyName;
            }
          }
          
          // Update location if available and not already set
          if (profile._json && profile._json.locale && !user.homeLocation?.city) {
            // Google profile may include locale information
            // Note: Google OAuth doesn't typically provide location, but we check locale as a fallback
            // This could be enhanced if we request additional scopes
          }
          
          // Update last login time
          user.lastLoginAt = new Date();
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same email
        if (profile.emails && profile.emails.length > 0) {
          const emailValue = profile.emails[0].value;
          const existingUser = await User.findOne({ email: emailValue });
          
          if (existingUser) {
            // If linking account, verify the email matches the current user
            if (isLinkingAccount && linkingUserId) {
              if (existingUser._id.toString() !== linkingUserId) {
                // Email matches a different user - don't link, return error
                return done(new Error('This email is already associated with another account. Please use a different Google account or contact support.'), null);
              }
              // Email matches current user - link Google account
              const isFirstGoogleLink = !existingUser.googleId;
              existingUser.googleId = profile.id;
              existingUser.googleAccessToken = accessToken;
              existingUser.googleRefreshToken = refreshToken;
              existingUser.oauthVerified = existingUser.oauthVerified || {};
              existingUser.oauthVerified.google = true;
              
              // Update profile picture from Google only if user doesn't have one or is first time linking
              if (profile.photos && profile.photos.length > 0 && (!existingUser.profilePic || isFirstGoogleLink)) {
                let photoUrl = profile.photos[0].value;
                photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
                existingUser.profilePic = photoUrl;
              }
              
              // Update names from Google only if not already set
              if (profile.name) {
                if (profile.name.givenName && !existingUser.givenName) {
                  existingUser.givenName = profile.name.givenName;
                }
                if (profile.name.familyName && !existingUser.familyName) {
                  existingUser.familyName = profile.name.familyName;
                }
              }
              
              existingUser.lastLoginAt = new Date();
              await existingUser.save();
              return done(null, existingUser);
            }
            
            // Not linking - Link Google account to existing user
            existingUser.googleId = profile.id;
            existingUser.googleAccessToken = accessToken;
            existingUser.googleRefreshToken = refreshToken;
            existingUser.oauthVerified = existingUser.oauthVerified || {};
            existingUser.oauthVerified.google = true; // Mark Google OAuth as verified
            
            // Update profile picture from Google only if user doesn't have one or is first time linking
            const isFirstGoogleLink = !existingUser.googleId;
            if (profile.photos && profile.photos.length > 0 && (!existingUser.profilePic || isFirstGoogleLink)) {
              let photoUrl = profile.photos[0].value;
              photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
              existingUser.profilePic = photoUrl;
            }
            
            // Update names from Google only if not already set
            if (profile.name) {
              if (profile.name.givenName && !existingUser.givenName) {
                existingUser.givenName = profile.name.givenName;
              }
              if (profile.name.familyName && !existingUser.familyName) {
                existingUser.familyName = profile.name.familyName;
              }
            }
            
            // Update location if available and not already set
            if (profile._json && profile._json.locale && !existingUser.homeLocation?.city) {
              // Google profile may include locale information
              // Note: Google OAuth doesn't typically provide location, but we check locale as a fallback
            }
            
            // Update last login time
            existingUser.lastLoginAt = new Date();
            await existingUser.save();
            return done(null, existingUser);
          }
        }
        
        // If linking account and no user found, link to the current user
        if (isLinkingAccount && linkingUserId) {
          const currentUser = await User.findById(linkingUserId);
          if (currentUser) {
            // Link Google account to current user
            const isFirstGoogleLink = !currentUser.googleId;
            currentUser.googleId = profile.id;
            currentUser.googleAccessToken = accessToken;
            currentUser.googleRefreshToken = refreshToken;
            currentUser.oauthVerified = currentUser.oauthVerified || {};
            currentUser.oauthVerified.google = true;
            
            // Update profile picture from Google only if user doesn't have one or is first time linking
            if (profile.photos && profile.photos.length > 0 && (!currentUser.profilePic || isFirstGoogleLink)) {
              let photoUrl = profile.photos[0].value;
              photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
              currentUser.profilePic = photoUrl;
            }
            
            // Update names from Google only if not already set
            if (profile.name) {
              if (profile.name.givenName && !currentUser.givenName) {
                currentUser.givenName = profile.name.givenName;
              }
              if (profile.name.familyName && !currentUser.familyName) {
                currentUser.familyName = profile.name.familyName;
              }
            }
            
            currentUser.lastLoginAt = new Date();
            await currentUser.save();
            return done(null, currentUser);
          }
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        // With passReqToCallback: true, req is available as first parameter
        let parentInviteCode = null;
        let inviter = null;
        let inviteCodeObj = null;
        if (req && req.session && req.session.pendingInviteCode) {
          const code = req.session.pendingInviteCode;
          // Validate invite code using new helper method
          inviter = await User.findByInviteCode(code);
          if (inviter) {
            parentInviteCode = code.toUpperCase();
            inviteCodeObj = inviter.findInviteCodeObject(code);
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode || !inviter) {
          return done(new Error('Valid invite code required to create account'), null);
        }
        
        // Check if code is active
        if (inviteCodeObj && !inviteCodeObj.isActive) {
          return done(new Error('This invite code has been deactivated'), null);
        }
        
        // Check if inviter has invite credits (admins have unlimited credits)
        const isInviterAdmin = inviter.role && inviter.role.includes('admin');
        if (!isInviterAdmin) {
          // Check if inviter has invite credits
          if (!inviter.inviteCredits || inviter.inviteCredits <= 0) {
            return done(new Error('This invite code has no remaining invites'), null);
          }
        }
        
        const emailValue = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        
        // Generate username with proper sanitization and fallbacks
        let usernameValue = null;
        if (profile.displayName) {
          // Sanitize displayName: remove spaces, special chars, limit length
          usernameValue = profile.displayName
            .replace(/\s+/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 20); // Limit length
        } else if (profile.name && (profile.name.givenName || profile.name.familyName)) {
          // Use name fields as fallback
          const nameParts = [profile.name.givenName, profile.name.familyName].filter(Boolean);
          usernameValue = nameParts.join('') + Math.random().toString(36).substr(2, 4);
          usernameValue = usernameValue.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
        } else if (emailValue) {
          // Use email prefix as last resort
          usernameValue = emailValue.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        } else {
          // Final fallback
          usernameValue = `google_${profile.id.substring(0, 10)}`;
        }
        
        // Ensure username is unique
        let finalUsername = usernameValue;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${usernameValue}${counter}`;
          counter++;
        }
        
        console.log('Creating new user with:', {
          googleId: profile.id,
          email: emailValue,
          username: finalUsername,
          givenName: profile.name.givenName,
          familyName: profile.name.familyName
        });
        
        // Get high-res profile picture
        let profilePicUrl = null;
        if (profile.photos && profile.photos.length > 0) {
          profilePicUrl = profile.photos[0].value;
          profilePicUrl = profilePicUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
        }

        // Extract location data from Google profile (if available)
        // Note: Google OAuth doesn't typically provide location in basic profile
        // This would require additional scopes and Google People API
        let locationData = null;
        // If we ever get location from Google, we can add it here
        // For now, we'll leave it null and let IP detection handle it if needed

        const newInviteCode = generateInviteCode();
        const newUser = new User({
          googleId: profile.id,
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken,
          email: emailValue,
          username: finalUsername,
          givenName: profile.name ? profile.name.givenName : null,
          familyName: profile.name ? profile.name.familyName : null,
          profilePic: profilePicUrl,
          homeLocation: locationData,
          isActive: true,
          role: ['user'],
          balance: 0,
          // Generate invite codes - both old and new format
          personalInviteCode: newInviteCode, // Keep for backward compatibility
          personalInviteCodes: [{
            code: newInviteCode,
            isActive: true,
            label: 'Primary',
            createdAt: new Date(),
            usageCount: 0
          }],
          parentInviteCode: parentInviteCode,
          parentInviteCodeId: inviteCodeObj && inviteCodeObj._id ? inviteCodeObj._id : null,
          // Mark Google OAuth as verified
          oauthVerified: {
            google: true,
            facebook: false,
            instagram: false,
            soundcloud: false
          },
          lastLoginAt: new Date()
        });
        
        await newUser.save();
        
        // Increment usage count for the invite code that was used
        if (inviteCodeObj && inviteCodeObj._id && inviter.personalInviteCodes) {
          const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic._id && ic._id.toString() === inviteCodeObj._id.toString());
          if (codeIndex !== -1) {
            inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            await inviter.save();
          }
        } else if (inviter.personalInviteCode === parentInviteCode) {
          // Legacy code handling
          if (!inviter.personalInviteCodes || inviter.personalInviteCodes.length === 0) {
            inviter.personalInviteCodes = [{
              code: inviter.personalInviteCode,
              isActive: true,
              label: 'Primary',
              createdAt: inviter.createdAt || new Date(),
              usageCount: 1
            }];
          } else {
            const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic.code === parentInviteCode);
            if (codeIndex !== -1) {
              inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            }
          }
          await inviter.save();
        }
        
        // Give beta users £1.11 credit on sign up
        try {
          const { giveBetaSignupCredit } = require('../utils/betaCreditHelper');
          await giveBetaSignupCredit(newUser);
        } catch (betaCreditError) {
          console.error('Failed to give beta signup credit:', betaCreditError);
          // Don't fail registration if beta credit fails
        }
        
        // Decrement inviter's invite credits (unless admin - admins have unlimited)
        if (!isInviterAdmin && inviter.inviteCredits > 0) {
          inviter.inviteCredits -= 1;
          await inviter.save();
          console.log(`✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`);
        }
        
        // Auto-join new Google OAuth user to Global Party
        try {
          const Party = require('../models/Party');
          const globalParty = await Party.getGlobalParty();
          if (globalParty && !globalParty.partiers.includes(newUser._id)) {
            // Add user to Global Party's partiers array
            globalParty.partiers.push(newUser._id);
            await globalParty.save();
            
            // Add Global Party to user's joinedParties array
            newUser.joinedParties.push({
              partyId: globalParty._id, // Using ObjectId directly
              role: 'partier'
            });
            await newUser.save();
            
            console.log('✅ Auto-joined new Google OAuth user to Global Party:', newUser.username);
          }
        } catch (globalPartyError) {
          console.error('Failed to auto-join Google OAuth user to Global Party:', globalPartyError);
          // Don't fail OAuth registration if Global Party join fails
        }
        
        return done(null, newUser);
        
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  ));
} else {
  console.log('⚠️  Google OAuth not configured - GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing');
}

// SoundCloud OAuth Strategy - only configure if environment variables are available
if (process.env.SOUNDCLOUD_CLIENT_ID && process.env.SOUNDCLOUD_CLIENT_SECRET) {
  // Create strategy instance (don't use passport.use yet, we need to override userProfile first)
  const strategy = new SoundCloudStrategy({
      clientID: process.env.SOUNDCLOUD_CLIENT_ID,
      clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET,
      callbackURL: process.env.SOUNDCLOUD_CALLBACK_URL || "http://localhost:8000/api/auth/soundcloud/callback",
      passReqToCallback: true  // Enable passing req to callback for session access
    },
    async (req, accessToken, refreshToken, profileFromLibrary, done) => {
      // The passport-soundcloud library fails due to SoundCloud's API security updates
      // We'll manually fetch the profile using the access token with proper Authorization header
      let profile = profileFromLibrary;
      
      try {
        // If the library failed to get profile (profile is null or missing id), fetch it manually
        if (!profile || !profile.id) {
          console.log('🔄 Manually fetching SoundCloud profile due to library limitation');
          
          try {
            const response = await axios.get('https://api.soundcloud.com/me.json', {
              headers: {
                'Authorization': `OAuth ${accessToken}`  // SoundCloud requires OAuth prefix
              }
            });
            
            console.log('✅ Successfully fetched SoundCloud profile manually');
            
            // Transform SoundCloud API response to Passport profile format
            profile = {
              provider: 'soundcloud',
              id: response.data.id.toString(),
              username: response.data.username,
              displayName: response.data.full_name || response.data.username,
              emails: response.data.email ? [{ value: response.data.email }] : [],
              photos: response.data.avatar_url ? [{ value: response.data.avatar_url }] : [],
              _raw: JSON.stringify(response.data),
              _json: response.data
            };
          } catch (fetchError) {
            console.error('❌ Failed to manually fetch SoundCloud profile:', fetchError);
            console.error('Error response:', fetchError.response?.data);
            console.error('Error status:', fetchError.response?.status);
            // Continue with original profile (might be partial) or fail
            if (!profile) {
              return done(fetchError, null);
            }
          }
        }
        
        // Use the profile (either from library or manually fetched)
        console.log('🎵 SoundCloud OAuth callback - profile received');
        console.log('📦 Access token exists:', !!accessToken);
        console.log('👤 Profile data:', {
          id: profile?.id,
          username: profile?.username,
          displayName: profile?.displayName,
          emails: profile?.emails,
          photos: profile?.photos
        });
        
        // Validate profile data
        if (!profile || !profile.id) {
          console.error('❌ SoundCloud profile is missing or invalid:', profile);
          return done(new Error('Invalid SoundCloud profile data'), null);
        }
        
        // Check if this is an account linking request
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // Check if user already exists with this SoundCloud ID
        let user = await User.findOne({ soundcloudId: profile.id });
        
        if (user) {
          // If linking account and the SoundCloud account is already linked to a different user
          if (isLinkingAccount && linkingUserId) {
            if (user._id.toString() !== linkingUserId) {
              // SoundCloud account is already linked to a different user
              return done(new Error('This SoundCloud account is already linked to another user account. Please use a different account.'), null);
            }
            // SoundCloud account is already linked to the current user - just update tokens
            user.soundcloudAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.soundcloud = true;
            await user.save();
            return done(null, user);
          }
          
          // Not linking - just log in as the existing user
          user.soundcloudAccessToken = accessToken;
          user.oauthVerified = user.oauthVerified || {};
          user.oauthVerified.soundcloud = true; // Mark SoundCloud OAuth as verified
          
          // Update username if not set
          if (profile.username && !user.soundcloudUsername) {
            user.soundcloudUsername = profile.username;
          }
          
          // Update email if user doesn't have one
          if (profile.emails && profile.emails.length > 0 && !user.email) {
            user.email = profile.emails[0].value;
          }
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            user.profilePic = profile.photos[0].value;
          }
          
          // Update last login time
          user.lastLoginAt = new Date();
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same username (SoundCloud doesn't always provide email)
        if (profile.username) {
          user = await User.findOne({ username: profile.username });
          
          if (user) {
            // If linking account, verify the username matches the current user
            if (isLinkingAccount && linkingUserId) {
              if (user._id.toString() !== linkingUserId) {
                // Username matches a different user - don't link, return error
                return done(new Error('This username is already associated with another account. Please use a different SoundCloud account or contact support.'), null);
              }
              // Username matches current user - link SoundCloud account
              const isFirstSoundCloudLink = !user.soundcloudId;
              user.soundcloudId = profile.id;
              user.soundcloudUsername = profile.username;
              user.soundcloudAccessToken = accessToken;
              user.oauthVerified = user.oauthVerified || {};
              user.oauthVerified.soundcloud = true;
              
              // Update email if user doesn't have one
              if (profile.emails && profile.emails.length > 0 && !user.email) {
                user.email = profile.emails[0].value;
              }
              
              // Update profile picture if user doesn't have one or is linking SoundCloud for first time
              if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstSoundCloudLink)) {
                user.profilePic = profile.photos[0].value;
              }
              
              user.lastLoginAt = new Date();
              await user.save();
              return done(null, user);
            }
            
            // Not linking - link SoundCloud account to existing user by username
            const isFirstSoundCloudLink = !user.soundcloudId;
            user.soundcloudId = profile.id;
            user.soundcloudUsername = profile.username;
            user.soundcloudAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.soundcloud = true; // Mark SoundCloud OAuth as verified
            
            // Update email if user doesn't have one
            if (profile.emails && profile.emails.length > 0 && !user.email) {
              user.email = profile.emails[0].value;
            }
            
            // Update profile picture if user doesn't have one or is linking SoundCloud for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstSoundCloudLink)) {
              user.profilePic = profile.photos[0].value;
            }
            
            // Update last login time
            user.lastLoginAt = new Date();
            await user.save();
            return done(null, user);
          }
        }
        
        // Check if user exists with the same email (if provided)
        if (profile.emails && profile.emails.length > 0) {
          user = await User.findOne({ email: profile.emails[0].value });
          
          if (user) {
            // If linking account, verify the email matches the current user
            if (isLinkingAccount && linkingUserId) {
              if (user._id.toString() !== linkingUserId) {
                // Email matches a different user - don't link, return error
                return done(new Error('This email is already associated with another account. Please use a different SoundCloud account or contact support.'), null);
              }
              // Email matches current user - link SoundCloud account
              const isFirstSoundCloudLink = !user.soundcloudId;
              user.soundcloudId = profile.id;
              user.soundcloudUsername = profile.username;
              user.soundcloudAccessToken = accessToken;
              user.oauthVerified = user.oauthVerified || {};
              user.oauthVerified.soundcloud = true;
              
              // Update profile picture if user doesn't have one or is linking SoundCloud for first time
              if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstSoundCloudLink)) {
                user.profilePic = profile.photos[0].value;
              }
              
              user.lastLoginAt = new Date();
              await user.save();
              return done(null, user);
            }
            
            // Not linking - link SoundCloud account to existing user by email
            const isFirstSoundCloudLink = !user.soundcloudId;
            user.soundcloudId = profile.id;
            user.soundcloudUsername = profile.username;
            user.soundcloudAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.soundcloud = true;
            
            // Update profile picture if user doesn't have one or is linking SoundCloud for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstSoundCloudLink)) {
              user.profilePic = profile.photos[0].value;
            }
            
            user.lastLoginAt = new Date();
            await user.save();
            return done(null, user);
          }
        }
        
        // If linking account but no user found by username, email, or SoundCloud ID, link to current user
        if (isLinkingAccount && linkingUserId) {
          const currentUser = await User.findById(linkingUserId);
          if (!currentUser) {
            return done(new Error('User session expired. Please log in again.'), null);
          }
          
          // Link SoundCloud account to current user
          currentUser.soundcloudId = profile.id;
          currentUser.soundcloudUsername = profile.username;
          currentUser.soundcloudAccessToken = accessToken;
          currentUser.oauthVerified = currentUser.oauthVerified || {};
          currentUser.oauthVerified.soundcloud = true;
          
          // Update email if user doesn't have one
          if (profile.emails && profile.emails.length > 0 && !currentUser.email) {
            currentUser.email = profile.emails[0].value;
          }
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !currentUser.profilePic) {
            currentUser.profilePic = profile.photos[0].value;
          }
          
          await currentUser.save();
          return done(null, currentUser);
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        let parentInviteCode = null;
        let inviter = null;
        let inviteCodeObj = null;
        if (req && req.session && req.session.pendingInviteCode) {
          const code = req.session.pendingInviteCode;
          // Validate invite code using new helper method
          inviter = await User.findByInviteCode(code);
          if (inviter) {
            parentInviteCode = code.toUpperCase();
            inviteCodeObj = inviter.findInviteCodeObject(code);
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode || !inviter) {
          return done(new Error('Valid invite code required to create account'), null);
        }
        
        // Check if code is active
        if (inviteCodeObj && !inviteCodeObj.isActive) {
          return done(new Error('This invite code has been deactivated'), null);
        }
        
        // Check if inviter has invite credits (admins have unlimited credits)
        const isInviterAdmin = inviter.role && inviter.role.includes('admin');
        if (!isInviterAdmin) {
          // Check if inviter has invite credits
          if (!inviter.inviteCredits || inviter.inviteCredits <= 0) {
            return done(new Error('This invite code has no remaining invites'), null);
          }
        }
        
        const usernameValue = profile.username || `soundcloud_${profile.id}`;
        
        // Extract email from profile
        const emailValue = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        
        // Ensure username is unique
        let finalUsername = usernameValue;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${usernameValue}${counter}`;
          counter++;
        }
        
        console.log('Creating new user with:', {
          soundcloudId: profile.id,
          email: emailValue,
          username: finalUsername,
          soundcloudUsername: profile.username
        });
        
        // Get profile picture
        let profilePicUrl = null;
        if (profile.photos && profile.photos.length > 0) {
          profilePicUrl = profile.photos[0].value;
        }

        const newInviteCode = generateInviteCode();
        const newUser = new User({
          soundcloudId: profile.id,
          soundcloudUsername: profile.username,
          soundcloudAccessToken: accessToken,
          email: emailValue,
          username: finalUsername,
          givenName: profile.name ? profile.name.givenName : null,
          familyName: profile.name ? profile.name.familyName : null,
          profilePic: profilePicUrl,
          isActive: true,
          role: ['user'],
          balance: 0,
          // Generate invite codes - both old and new format
          personalInviteCode: newInviteCode, // Keep for backward compatibility
          personalInviteCodes: [{
            code: newInviteCode,
            isActive: true,
            label: 'Primary',
            createdAt: new Date(),
            usageCount: 0
          }],
          parentInviteCode: parentInviteCode,
          parentInviteCodeId: inviteCodeObj && inviteCodeObj._id ? inviteCodeObj._id : null,
          // Mark SoundCloud OAuth as verified
          oauthVerified: {
            soundcloud: true,
            facebook: false,
            instagram: false,
            google: false
          },
          lastLoginAt: new Date()
        });
        
        await newUser.save();
        
        // Increment usage count for the invite code that was used
        if (inviteCodeObj && inviteCodeObj._id && inviter.personalInviteCodes) {
          const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic._id && ic._id.toString() === inviteCodeObj._id.toString());
          if (codeIndex !== -1) {
            inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            await inviter.save();
          }
        } else if (inviter.personalInviteCode === parentInviteCode) {
          // Legacy code handling
          if (!inviter.personalInviteCodes || inviter.personalInviteCodes.length === 0) {
            inviter.personalInviteCodes = [{
              code: inviter.personalInviteCode,
              isActive: true,
              label: 'Primary',
              createdAt: inviter.createdAt || new Date(),
              usageCount: 1
            }];
          } else {
            const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic.code === parentInviteCode);
            if (codeIndex !== -1) {
              inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            }
          }
          await inviter.save();
        }
        
        // Give beta users £1.11 credit on sign up
        try {
          const { giveBetaSignupCredit } = require('../utils/betaCreditHelper');
          await giveBetaSignupCredit(newUser);
        } catch (betaCreditError) {
          console.error('Failed to give beta signup credit:', betaCreditError);
          // Don't fail registration if beta credit fails
        }
        
        // Decrement inviter's invite credits (unless admin - admins have unlimited)
        if (!isInviterAdmin && inviter.inviteCredits > 0) {
          inviter.inviteCredits -= 1;
          await inviter.save();
          console.log(`✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`);
        }
        
        // Auto-join new SoundCloud OAuth user to Global Party
        try {
          const Party = require('../models/Party');
          const globalParty = await Party.getGlobalParty();
          if (globalParty && !globalParty.partiers.includes(newUser._id)) {
            // Add user to Global Party's partiers array
            globalParty.partiers.push(newUser._id);
            await globalParty.save();
            
            // Add Global Party to user's joinedParties array
            newUser.joinedParties.push({
              partyId: globalParty._id, // Using ObjectId directly
              role: 'partier'
            });
            await newUser.save();
            
            console.log('✅ Auto-joined new SoundCloud OAuth user to Global Party:', newUser.username);
          }
        } catch (globalPartyError) {
          console.error('Failed to auto-join SoundCloud OAuth user to Global Party:', globalPartyError);
          // Don't fail OAuth registration if Global Party join fails
        }
        
        return done(null, newUser);
        
      } catch (error) {
        console.error('SoundCloud OAuth error:', error);
        return done(error, null);
      }
    }
  );
  
  // Override the userProfile method to use manual fetch with proper Authorization header
  strategy.userProfile = async function(accessToken, done) {
    try {
      console.log('🔄 Fetching SoundCloud profile with proper Authorization header');
      const response = await axios.get('https://api.soundcloud.com/me.json', {
        headers: {
          'Authorization': `OAuth ${accessToken}`  // SoundCloud requires OAuth prefix
        }
      });
      
      const profile = {
        provider: 'soundcloud',
        id: response.data.id.toString(),
        username: response.data.username,
        displayName: response.data.full_name || response.data.username,
        emails: response.data.email ? [{ value: response.data.email }] : [],
        photos: response.data.avatar_url ? [{ value: response.data.avatar_url }] : [],
        _raw: JSON.stringify(response.data),
        _json: response.data
      };
      
      console.log('✅ SoundCloud profile fetched successfully');
      return done(null, profile);
    } catch (error) {
      console.error('❌ Error fetching SoundCloud profile:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      return done(new Error('failed to fetch user profile', error), null);
    }
  };
  
  passport.use(strategy);
} else {
  console.log('⚠️  SoundCloud OAuth not configured - SOUNDCLOUD_CLIENT_ID or SOUNDCLOUD_CLIENT_SECRET missing');
}

// Instagram OAuth Strategy - only configure if environment variables are available
if (process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
  passport.use(new InstagramStrategy({
      clientID: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      callbackURL: process.env.INSTAGRAM_CALLBACK_URL || "http://localhost:8000/api/auth/instagram/callback",
      passReqToCallback: true  // Enable passing req to callback for session access
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        console.log('Instagram profile:', profile);
        
        // Check if this is an account linking request
        const isLinkingAccount = req.session?.linkAccount === true;
        const linkingUserId = req.session?.linkingUserId;
        
        // Check if user already exists with this Instagram ID
        let user = await User.findOne({ instagramId: profile.id });
        
        if (user) {
          // If linking account and the Instagram account is already linked to a different user
          if (isLinkingAccount && linkingUserId) {
            if (user._id.toString() !== linkingUserId) {
              // Instagram account is already linked to a different user
              return done(new Error('This Instagram account is already linked to another user account. Please use a different account.'), null);
            }
            // Instagram account is already linked to the current user - just update tokens
            user.instagramAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.instagram = true;
            await user.save();
            return done(null, user);
          }
          
          // Not linking - just log in as the existing user
          user.instagramAccessToken = accessToken;
          user.oauthVerified = user.oauthVerified || {};
          user.oauthVerified.instagram = true; // Mark Instagram OAuth as verified
          
          // Update username if not set
          if (profile.username && !user.instagramUsername) {
            user.instagramUsername = profile.username;
          }
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            user.profilePic = profile.photos[0].value;
          }
          
          // Update last login time
          user.lastLoginAt = new Date();
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same username
        if (profile.username) {
          user = await User.findOne({ username: profile.username });
          
          if (user) {
            // If linking account, verify the username matches the current user
            if (isLinkingAccount && linkingUserId) {
              if (user._id.toString() !== linkingUserId) {
                // Username matches a different user - don't link, return error
                return done(new Error('This username is already associated with another account. Please use a different Instagram account or contact support.'), null);
              }
              // Username matches current user - link Instagram account
              const isFirstInstagramLink = !user.instagramId;
              user.instagramId = profile.id;
              user.instagramUsername = profile.username;
              user.instagramAccessToken = accessToken;
              user.oauthVerified = user.oauthVerified || {};
              user.oauthVerified.instagram = true;
              
              // Update profile picture if user doesn't have one or is linking Instagram for first time
              if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstInstagramLink)) {
                user.profilePic = profile.photos[0].value;
              }
              
              user.lastLoginAt = new Date();
              await user.save();
              return done(null, user);
            }
            
            // Not linking - link Instagram account to existing user by username
            const isFirstInstagramLink = !user.instagramId;
            user.instagramId = profile.id;
            user.instagramUsername = profile.username;
            user.instagramAccessToken = accessToken;
            user.oauthVerified = user.oauthVerified || {};
            user.oauthVerified.instagram = true; // Mark Instagram OAuth as verified
            
            // Update profile picture if user doesn't have one or is linking Instagram for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstInstagramLink)) {
              user.profilePic = profile.photos[0].value;
            }
            
            // Update last login time
            user.lastLoginAt = new Date();
            await user.save();
            return done(null, user);
          }
        }
        
        // If linking account but no user found by username or Instagram ID, link to current user
        if (isLinkingAccount && linkingUserId) {
          const currentUser = await User.findById(linkingUserId);
          if (!currentUser) {
            return done(new Error('User session expired. Please log in again.'), null);
          }
          
          // Link Instagram account to current user
          currentUser.instagramId = profile.id;
          currentUser.instagramUsername = profile.username;
          currentUser.instagramAccessToken = accessToken;
          currentUser.oauthVerified = currentUser.oauthVerified || {};
          currentUser.oauthVerified.instagram = true;
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !currentUser.profilePic) {
            currentUser.profilePic = profile.photos[0].value;
          }
          
          await currentUser.save();
          return done(null, currentUser);
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        let parentInviteCode = null;
        let inviter = null;
        let inviteCodeObj = null;
        if (req && req.session && req.session.pendingInviteCode) {
          const code = req.session.pendingInviteCode;
          // Validate invite code using new helper method
          inviter = await User.findByInviteCode(code);
          if (inviter) {
            parentInviteCode = code.toUpperCase();
            inviteCodeObj = inviter.findInviteCodeObject(code);
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode || !inviter) {
          return done(new Error('Valid invite code required to create account'), null);
        }
        
        // Check if code is active
        if (inviteCodeObj && !inviteCodeObj.isActive) {
          return done(new Error('This invite code has been deactivated'), null);
        }
        
        // Check if inviter has invite credits (admins have unlimited credits)
        const isInviterAdmin = inviter.role && inviter.role.includes('admin');
        if (!isInviterAdmin) {
          // Check if inviter has invite credits
          if (!inviter.inviteCredits || inviter.inviteCredits <= 0) {
            return done(new Error('This invite code has no remaining invites'), null);
          }
        }
        
        const usernameValue = profile.username || `instagram_${profile.id}`;
        
        // Ensure username is unique
        let finalUsername = usernameValue;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${usernameValue}${counter}`;
          counter++;
        }
        
        console.log('Creating new user with:', {
          instagramId: profile.id,
          username: finalUsername,
          instagramUsername: profile.username
        });
        
        // Get profile picture
        let profilePicUrl = null;
        if (profile.photos && profile.photos.length > 0) {
          profilePicUrl = profile.photos[0].value;
        }

        const newInviteCode = generateInviteCode();
        const newUser = new User({
          instagramId: profile.id,
          instagramUsername: profile.username,
          instagramAccessToken: accessToken,
          username: finalUsername,
          givenName: profile.name ? profile.name.givenName : null,
          familyName: profile.name ? profile.name.familyName : null,
          profilePic: profilePicUrl,
          isActive: true,
          role: ['user'],
          balance: 0,
          // Generate invite codes - both old and new format
          personalInviteCode: newInviteCode, // Keep for backward compatibility
          personalInviteCodes: [{
            code: newInviteCode,
            isActive: true,
            label: 'Primary',
            createdAt: new Date(),
            usageCount: 0
          }],
          parentInviteCode: parentInviteCode,
          parentInviteCodeId: inviteCodeObj && inviteCodeObj._id ? inviteCodeObj._id : null,
          // Mark Instagram OAuth as verified
          oauthVerified: {
            instagram: true,
            facebook: false,
            soundcloud: false,
            google: false
          },
          lastLoginAt: new Date()
        });
        
        await newUser.save();
        
        // Increment usage count for the invite code that was used
        if (inviteCodeObj && inviteCodeObj._id && inviter.personalInviteCodes) {
          const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic._id && ic._id.toString() === inviteCodeObj._id.toString());
          if (codeIndex !== -1) {
            inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            await inviter.save();
          }
        } else if (inviter.personalInviteCode === parentInviteCode) {
          // Legacy code handling
          if (!inviter.personalInviteCodes || inviter.personalInviteCodes.length === 0) {
            inviter.personalInviteCodes = [{
              code: inviter.personalInviteCode,
              isActive: true,
              label: 'Primary',
              createdAt: inviter.createdAt || new Date(),
              usageCount: 1
            }];
          } else {
            const codeIndex = inviter.personalInviteCodes.findIndex(ic => ic.code === parentInviteCode);
            if (codeIndex !== -1) {
              inviter.personalInviteCodes[codeIndex].usageCount = (inviter.personalInviteCodes[codeIndex].usageCount || 0) + 1;
            }
          }
          await inviter.save();
        }
        
        // Decrement inviter's invite credits (unless admin - admins have unlimited)
        if (!isInviterAdmin && inviter.inviteCredits > 0) {
          inviter.inviteCredits -= 1;
          await inviter.save();
          console.log(`✅ Decremented invite credits for ${inviter.username}. Remaining: ${inviter.inviteCredits}`);
        }
        
        // Auto-join new Instagram OAuth user to Global Party
        try {
          const Party = require('../models/Party');
          const globalParty = await Party.getGlobalParty();
          if (globalParty && !globalParty.partiers.includes(newUser._id)) {
            // Add user to Global Party's partiers array
            globalParty.partiers.push(newUser._id);
            await globalParty.save();
            
            // Add Global Party to user's joinedParties array
            newUser.joinedParties.push({
              partyId: globalParty._id, // Using ObjectId directly
              role: 'partier'
            });
            await newUser.save();
            
            console.log('✅ Auto-joined new Instagram OAuth user to Global Party:', newUser.username);
          }
        } catch (globalPartyError) {
          console.error('Failed to auto-join Instagram OAuth user to Global Party:', globalPartyError);
          // Don't fail OAuth registration if Global Party join fails
        }
        
        return done(null, newUser);
        
      } catch (error) {
        console.error('Instagram OAuth error:', error);
        return done(error, null);
      }
    }
  ));
} else {
  console.log('⚠️  Instagram OAuth not configured - INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET missing');
}

// Generate unique invite code
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
