const express = require('express');
const router = express.Router();

// Instagram Webhook Verification
router.get('/', (req, res) => {
  const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'tuneable_ig_webhook_verify';
  
  // Parse params from the webhook verification request
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Instagram webhook verification attempt:', { mode, token, challenge });
  
  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('Instagram webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      console.log('Instagram webhook verification failed - token mismatch');
      res.sendStatus(403);
    }
  } else {
    console.log('Instagram webhook verification failed - missing params');
    res.sendStatus(400);
  }
});

// Instagram Webhook Event Handler
router.post('/', (req, res) => {
  console.log('Instagram webhook event received:', JSON.stringify(req.body, null, 2));
  
  try {
    const body = req.body;
    
    // Check if this is an event from Instagram
    if (body.object === 'instagram') {
      // Return a '200 OK' response to all events
      res.status(200).send('EVENT_RECEIVED');
      
      // Process each entry
      body.entry.forEach(entry => {
        // Get the webhook event
        const webhookEvent = entry;
        console.log('Instagram webhook event:', webhookEvent);
        
        // Handle different types of events
        if (entry.changes) {
          entry.changes.forEach(change => {
            console.log('Instagram change:', change);
            
            // Handle different change types
            switch(change.field) {
              case 'comments':
                console.log('New comment:', change.value);
                // TODO: Handle new comments
                break;
              case 'mentions':
                console.log('New mention:', change.value);
                // TODO: Handle new mentions
                break;
              case 'story_insights':
                console.log('Story insights:', change.value);
                // TODO: Handle story insights
                break;
              default:
                console.log('Unhandled change type:', change.field);
            }
          });
        }
        
        // Handle messaging events
        if (entry.messaging) {
          entry.messaging.forEach(event => {
            console.log('Instagram messaging event:', event);
            // TODO: Handle messaging events
          });
        }
      });
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('Error processing Instagram webhook:', error);
    res.sendStatus(500);
  }
});

module.exports = router;

