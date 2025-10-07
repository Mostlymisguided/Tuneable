const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'JWT Secret failed to fly';

// Facebook OAuth Strategy - only configure if environment variables are available
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:8000/api/auth/facebook/callback",
      profileFields: ['id', 'emails', 'name', 'picture', 'location']
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
          user.profilePic = profile.photos[0].value;
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
            user.profilePic = profile.photos[0].value;
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
      
      const newUser = new User({
        facebookId: profile.id,
        facebookAccessToken: accessToken,
        email: emailValue,
        username: usernameValue,
        givenName: profile.name.givenName,
        familyName: profile.name.familyName,
        profilePic: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null,
        homeLocation: locationData,
        isActive: true,
        role: ['user'],
        balance: 0,
        // Generate invite codes
        personalInviteCode: generateInviteCode(),
        parentInviteCode: '7777' // Default parent code
      });
      
      await newUser.save();
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
