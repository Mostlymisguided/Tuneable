/**
 * Utility functions to transform MongoDB documents to use UUIDs in API responses
 */

/**
 * Transform a single document to use UUIDs instead of _id for external references
 * @param {Object} doc - MongoDB document
 * @param {Object} options - Transformation options
 * @returns {Object} Transformed document
 */
function transformDocument(doc, options = {}) {
  if (!doc) return null;
  
  const {
    includeId = false, // Whether to include the original _id
    excludeFields = [], // Fields to exclude from response
    includePopulatedFields = true // Whether to transform populated fields
  } = options;

  // Convert to plain object if it's a Mongoose document
  const plainDoc = doc.toObject ? doc.toObject() : doc;
  
  // Create transformed document
  const transformed = { ...plainDoc };
  
  // Replace _id with uuid for external API usage
  if (transformed.uuid) {
    transformed.id = transformed.uuid;
    if (!includeId) {
      delete transformed._id;
    }
  }
  
  // Remove excluded fields
  excludeFields.forEach(field => {
    delete transformed[field];
  });
  
  // Transform populated fields if they exist
  if (includePopulatedFields) {
    // Handle songs array in parties
    if (transformed.songs && Array.isArray(transformed.songs)) {
      transformed.songs = transformed.songs.map(song => {
        const transformedSong = { ...song };
        
        // Transform songId reference
        if (song.songId && song.songId.uuid) {
          transformedSong.song_uuid = song.songId.uuid;
          transformedSong.songId = song.songId.uuid;
        }
        
        // Transform addedBy reference
        if (song.addedBy && song.addedBy.uuid) {
          transformedSong.addedBy_uuid = song.addedBy.uuid;
          transformedSong.addedBy = song.addedBy.uuid;
        }
        
        // Transform vetoedBy reference
        if (song.vetoedBy && song.vetoedBy.uuid) {
          transformedSong.vetoedBy_uuid = song.vetoedBy.uuid;
          transformedSong.vetoedBy = song.vetoedBy.uuid;
        }
        
        return transformedSong;
      });
    }
    
    // Handle host reference - preserve username for display
    if (transformed.host && transformed.host.uuid) {
      transformed.host_uuid = transformed.host.uuid;
      // Keep the full host object for display purposes
      transformed.host = {
        uuid: transformed.host.uuid,
        username: transformed.host.username
      };
    }
    
    // Handle attendees array - preserve username for display
    if (transformed.attendees && Array.isArray(transformed.attendees)) {
      transformed.attendees = transformed.attendees.map(attendee => {
        if (attendee.uuid) {
          return {
            uuid: attendee.uuid,
            username: attendee.username
          };
        }
        return attendee;
      });
    }
    
    // Handle addedBy reference in songs
    if (transformed.addedBy && transformed.addedBy.uuid) {
      transformed.addedBy_uuid = transformed.addedBy.uuid;
      transformed.addedBy = transformed.addedBy.uuid;
    }
    
    // Handle bids array
    if (transformed.bids && Array.isArray(transformed.bids)) {
      transformed.bids = transformed.bids.map(bid => {
        const transformedBid = { ...bid };
        
        if (bid.uuid) {
          transformedBid.id = bid.uuid;
          if (!includeId) {
            delete transformedBid._id;
          }
        }
        
        // Transform user reference
        if (bid.userId && bid.userId.uuid) {
          transformedBid.user_uuid = bid.userId.uuid;
          transformedBid.userId = bid.userId.uuid;
        }
        
        // Transform party reference
        if (bid.partyId && bid.partyId.uuid) {
          transformedBid.party_uuid = bid.partyId.uuid;
          transformedBid.partyId = bid.partyId.uuid;
        }
        
        // Transform song reference
        if (bid.songId && bid.songId.uuid) {
          transformedBid.song_uuid = bid.songId.uuid;
          transformedBid.songId = bid.songId.uuid;
        }
        
        return transformedBid;
      });
    }
  }
  
  return transformed;
}

/**
 * Transform an array of documents
 * @param {Array} docs - Array of MongoDB documents
 * @param {Object} options - Transformation options
 * @returns {Array} Array of transformed documents
 */
function transformDocuments(docs, options = {}) {
  if (!Array.isArray(docs)) return [];
  return docs.map(doc => transformDocument(doc, options));
}

/**
 * Transform a response object that contains documents
 * @param {Object} response - Response object with data property
 * @param {Object} options - Transformation options
 * @returns {Object} Transformed response
 */
function transformResponse(response, options = {}) {
  if (!response || typeof response !== 'object') return response;
  
  const transformed = { ...response };
  
  // Transform single document
  if (transformed.party) {
    transformed.party = transformDocument(transformed.party, options);
  }
  
  if (transformed.user) {
    transformed.user = transformDocument(transformed.user, options);
  }
  
  if (transformed.song) {
    transformed.song = transformDocument(transformed.song, options);
  }
  
  if (transformed.bid) {
    transformed.bid = transformDocument(transformed.bid, options);
  }
  
  // Transform arrays
  if (transformed.parties) {
    transformed.parties = transformDocuments(transformed.parties, options);
  }
  
  if (transformed.users) {
    transformed.users = transformDocuments(transformed.users, options);
  }
  
  if (transformed.songs) {
    transformed.songs = transformDocuments(transformed.songs, options);
  }
  
  if (transformed.bids) {
    transformed.bids = transformDocuments(transformed.bids, options);
  }
  
  return transformed;
}

module.exports = {
  transformDocument,
  transformDocuments,
  transformResponse
};
