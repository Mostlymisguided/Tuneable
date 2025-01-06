const mongoose = require('mongoose');

// Function to validate MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = { isValidObjectId };
