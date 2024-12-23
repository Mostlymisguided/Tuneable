const mongoose = require('mongoose'); // Added mongoose import
const crypto = require('crypto');
const devUserId = new mongoose.Types.ObjectId(
  crypto.createHash('md5').update('dev-user').digest('hex').substring(0, 24)
);
