  // middleware/authMiddleware.js
  const jwt = require('jsonwebtoken');
  const SECRET_KEY = process.env.JWT_SECRET || 'bananasarebluewhenpigsfly';
  const DEV_TOKEN = process.env.DEV_WEB_TOKEN; // Replace with your actual dev token

  module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1]; // Expecting "Bearer <token>"
    if (!token) {
      return res.status(401).json({ error: 'Malformed token' });
    }

    // Allow permanent dev token
    if (token === DEV_TOKEN) {
      req.user = { userId: 'dev_user', role: 'developer' }; // Add dev user info to the request
      return next();
    }

    // Verify other tokens using JWT
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) {
        return res.status(401).json({ error: 'Invalid token', details: err.message });
      }
      req.user = decoded; // e.g., { userId, email, iat, exp }
      next();
    });

    console.log('Received Token:', token);
  console.log('Expected DEV_TOKEN:', DEV_TOKEN);
  console.log('Expected SECRET_KEY:', SECRET_KEY);


  };
