const authMiddleware = require('./authMiddleware');

/**
 * Admin middleware - requires user to be authenticated AND have admin role
 */
const adminMiddleware = async (req, res, next) => {
    // First run the auth middleware to ensure user is authenticated
    authMiddleware(req, res, (err) => {
        if (err) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Check if user has admin role
        if (!req.user.role || !req.user.role.includes('admin')) {
            return res.status(403).json({ 
                error: 'Admin access required',
                message: 'This feature is only available to administrators'
            });
        }

        console.log("✅ Admin access granted for:", req.user.username);
        next();
    });
};

module.exports = adminMiddleware;
