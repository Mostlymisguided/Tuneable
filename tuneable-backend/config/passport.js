const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const SoundCloudStrategy = require('passport-soundcloud').Strategy;
const InstagramStrategy = require('passport-instagram-graph').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Facebook OAuth Strategy - only configure if environment variables are available
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:8000/api/auth/facebook/callback",
      profileFields: ['id', 'emails', 'name', 'picture.type(large)', 'location']
    },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Facebook profile:', profile);
      
      // Check if user already exists with this Facebook ID
      let user = await User.findOne({ facebookId: profile.id });
      
      if (user) {
        // User exists, update their Facebook access token
        user.facebookAccessToken = accessToken;
        
        // Update profile picture if user doesn't have one
        if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
          // Request larger image by modifying the URL to 400x400
          let photoUrl = profile.photos[0].value;
          photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
          user.profilePic = photoUrl;
        }
        
        // Update location if available and not already set
        if (profile._json && profile._json.location && !user.homeLocation.city) {
          user.homeLocation = {
            city: profile._json.location.name || null,
            country: null
          };
        }
        
        await user.save();
        return done(null, user);
      }
      
      // Check if user exists with the same email
      if (profile.emails && profile.emails.length > 0) {
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Check if this is the first time linking Facebook
          const isFirstFacebookLink = !user.facebookId;
          
          // Link Facebook account to existing user
          user.facebookId = profile.id;
          user.facebookAccessToken = accessToken;
          
          // Update profile picture if user doesn't have one or is linking Facebook for first time
          if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstFacebookLink)) {
            // Request larger image by modifying the URL to 400x400
            let photoUrl = profile.photos[0].value;
            photoUrl = photoUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
            user.profilePic = photoUrl;
          }
          
          // Update location if available and not already set
          if (profile._json && profile._json.location && !user.homeLocation.city) {
            user.homeLocation = {
              city: profile._json.location.name || null,
              country: null
            };
          }
          
          await user.save();
          return done(null, user);
        }
      }
      
      // Create new user
      // Check for invite code in session (passed from OAuth initiation)
      let parentInviteCode = null;
      if (arguments[4] && arguments[4].session && arguments[4].session.pendingInviteCode) {
        const code = arguments[4].session.pendingInviteCode;
        // Validate invite code
        const inviter = await User.findOne({ personalInviteCode: code.toUpperCase() });
        if (inviter) {
          parentInviteCode = code.toUpperCase();
        }
      }
      
      // Require invite code for new users
      if (!parentInviteCode) {
        return done(new Error('Valid invite code required to create account'), null);
      }
      
      const emailValue = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
      const usernameValue = (profile.name.givenName + profile.name.familyName + Math.random().toString(36).substr(2, 4)).replace(/\s+/g, '');
      
      // Extract location data from Facebook profile
      let locationData = null;
      if (profile._json && profile._json.location) {
        locationData = {
          city: profile._json.location.name || null,
          country: null // Facebook location doesn't always provide country separately
        };
      }
      
      console.log('Creating new user with:', {
        facebookId: profile.id,
        email: emailValue,
        username: usernameValue,
        givenName: profile.name.givenName,
        familyName: profile.name.familyName,
        location: locationData
      });
      
      // Get high-res profile picture
      let profilePicUrl = null;
      if (profile.photos && profile.photos.length > 0) {
        profilePicUrl = profile.photos[0].value;
        profilePicUrl = profilePicUrl.replace(/width=\d+/, 'width=400').replace(/height=\d+/, 'height=400');
      }

      const newUser = new User({
        facebookId: profile.id,
        facebookAccessToken: accessToken,
        email: emailValue,
        username: usernameValue,
        givenName: profile.name.givenName,
        familyName: profile.name.familyName,
        profilePic: profilePicUrl,
        homeLocation: locationData,
        isActive: true,
        role: ['user'],
        balance: 0,
        // Generate invite codes
        personalInviteCode: generateInviteCode(),
        parentInviteCode: parentInviteCode
      });
      
      await newUser.save();
      
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
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:8000/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google profile:', profile);
        
        // Check if user already exists with this Google ID
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
          // User exists, update their Google tokens
          user.googleAccessToken = accessToken;
          user.googleRefreshToken = refreshToken;
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            // Request larger image by modifying the URL
            let photoUrl = profile.photos[0].value;
            photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
            user.profilePic = photoUrl;
          }
          
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same email
        if (profile.emails && profile.emails.length > 0) {
          const emailValue = profile.emails[0].value;
          const existingUser = await User.findOne({ email: emailValue });
          
          if (existingUser) {
            // Link Google account to existing user
            existingUser.googleId = profile.id;
            existingUser.googleAccessToken = accessToken;
            existingUser.googleRefreshToken = refreshToken;
            
            // Update profile picture if user doesn't have one
            if (profile.photos && profile.photos.length > 0 && !existingUser.profilePic) {
              // Request larger image by modifying the URL
              let photoUrl = profile.photos[0].value;
              photoUrl = photoUrl.replace(/=s\d+-c/, '=s400-c'); // Request 400x400 size
              existingUser.profilePic = photoUrl;
            }
            
            await existingUser.save();
            return done(null, existingUser);
          }
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        let parentInviteCode = null;
        if (arguments[4] && arguments[4].session && arguments[4].session.pendingInviteCode) {
          const code = arguments[4].session.pendingInviteCode;
          // Validate invite code
          const inviter = await User.findOne({ personalInviteCode: code.toUpperCase() });
          if (inviter) {
            parentInviteCode = code.toUpperCase();
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode) {
          return done(new Error('Valid invite code required to create account'), null);
        }
        
        const emailValue = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;
        const usernameValue = profile.displayName || profile.emails[0].value.split('@')[0];
        
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

        const newUser = new User({
          googleId: profile.id,
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken,
          email: emailValue,
          username: finalUsername,
          givenName: profile.name.givenName,
          familyName: profile.name.familyName,
          profilePic: profilePicUrl,
          isActive: true,
          role: ['user'],
          balance: 0,
          // Generate invite codes
          personalInviteCode: generateInviteCode(),
          parentInviteCode: parentInviteCode
        });
        
        await newUser.save();
        
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
  passport.use(new SoundCloudStrategy({
      clientID: process.env.SOUNDCLOUD_CLIENT_ID,
      clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET,
      callbackURL: process.env.SOUNDCLOUD_CALLBACK_URL || "http://localhost:8000/api/auth/soundcloud/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('SoundCloud profile:', profile);
        
        // Check if user already exists with this SoundCloud ID
        let user = await User.findOne({ soundcloudId: profile.id });
        
        if (user) {
          // User exists, update their SoundCloud access token
          user.soundcloudAccessToken = accessToken;
          
          // Update username if not set
          if (profile.username && !user.soundcloudUsername) {
            user.soundcloudUsername = profile.username;
          }
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            user.profilePic = profile.photos[0].value;
          }
          
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same username (SoundCloud doesn't always provide email)
        if (profile.username) {
          user = await User.findOne({ username: profile.username });
          
          if (user) {
            // Check if this is the first time linking SoundCloud
            const isFirstSoundCloudLink = !user.soundcloudId;
            
            // Link SoundCloud account to existing user
            user.soundcloudId = profile.id;
            user.soundcloudUsername = profile.username;
            user.soundcloudAccessToken = accessToken;
            
            // Update profile picture if user doesn't have one or is linking SoundCloud for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstSoundCloudLink)) {
              user.profilePic = profile.photos[0].value;
            }
            
            await user.save();
            return done(null, user);
          }
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        let parentInviteCode = null;
        if (arguments[4] && arguments[4].session && arguments[4].session.pendingInviteCode) {
          const code = arguments[4].session.pendingInviteCode;
          // Validate invite code
          const inviter = await User.findOne({ personalInviteCode: code.toUpperCase() });
          if (inviter) {
            parentInviteCode = code.toUpperCase();
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode) {
          return done(new Error('Valid invite code required to create account'), null);
        }
        
        const usernameValue = profile.username || `soundcloud_${profile.id}`;
        
        // Ensure username is unique
        let finalUsername = usernameValue;
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${usernameValue}${counter}`;
          counter++;
        }
        
        console.log('Creating new user with:', {
          soundcloudId: profile.id,
          username: finalUsername,
          soundcloudUsername: profile.username
        });
        
        // Get profile picture
        let profilePicUrl = null;
        if (profile.photos && profile.photos.length > 0) {
          profilePicUrl = profile.photos[0].value;
        }

        const newUser = new User({
          soundcloudId: profile.id,
          soundcloudUsername: profile.username,
          soundcloudAccessToken: accessToken,
          username: finalUsername,
          givenName: profile.name ? profile.name.givenName : null,
          familyName: profile.name ? profile.name.familyName : null,
          profilePic: profilePicUrl,
          isActive: true,
          role: ['user'],
          balance: 0,
          // Generate invite codes
          personalInviteCode: generateInviteCode(),
          parentInviteCode: parentInviteCode
        });
        
        await newUser.save();
        
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
  ));
} else {
  console.log('⚠️  SoundCloud OAuth not configured - SOUNDCLOUD_CLIENT_ID or SOUNDCLOUD_CLIENT_SECRET missing');
}

// Instagram OAuth Strategy - only configure if environment variables are available
if (process.env.INSTAGRAM_CLIENT_ID && process.env.INSTAGRAM_CLIENT_SECRET) {
  passport.use(new InstagramStrategy({
      clientID: process.env.INSTAGRAM_CLIENT_ID,
      clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
      callbackURL: process.env.INSTAGRAM_CALLBACK_URL || "http://localhost:8000/api/auth/instagram/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Instagram profile:', profile);
        
        // Check if user already exists with this Instagram ID
        let user = await User.findOne({ instagramId: profile.id });
        
        if (user) {
          // User exists, update their Instagram access token
          user.instagramAccessToken = accessToken;
          
          // Update username if not set
          if (profile.username && !user.instagramUsername) {
            user.instagramUsername = profile.username;
          }
          
          // Update profile picture if user doesn't have one
          if (profile.photos && profile.photos.length > 0 && !user.profilePic) {
            user.profilePic = profile.photos[0].value;
          }
          
          await user.save();
          return done(null, user);
        }
        
        // Check if user exists with the same username
        if (profile.username) {
          user = await User.findOne({ username: profile.username });
          
          if (user) {
            // Check if this is the first time linking Instagram
            const isFirstInstagramLink = !user.instagramId;
            
            // Link Instagram account to existing user
            user.instagramId = profile.id;
            user.instagramUsername = profile.username;
            user.instagramAccessToken = accessToken;
            
            // Update profile picture if user doesn't have one or is linking Instagram for first time
            if (profile.photos && profile.photos.length > 0 && (!user.profilePic || isFirstInstagramLink)) {
              user.profilePic = profile.photos[0].value;
            }
            
            await user.save();
            return done(null, user);
          }
        }
        
        // Create new user
        // Check for invite code in session (passed from OAuth initiation)
        let parentInviteCode = null;
        if (arguments[4] && arguments[4].session && arguments[4].session.pendingInviteCode) {
          const code = arguments[4].session.pendingInviteCode;
          // Validate invite code
          const inviter = await User.findOne({ personalInviteCode: code.toUpperCase() });
          if (inviter) {
            parentInviteCode = code.toUpperCase();
          }
        }
        
        // Require invite code for new users
        if (!parentInviteCode) {
          return done(new Error('Valid invite code required to create account'), null);
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
          // Generate invite codes
          personalInviteCode: generateInviteCode(),
          parentInviteCode: parentInviteCode
        });
        
        await newUser.save();
        
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
