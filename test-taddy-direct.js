const axios = require('axios');

async function testTaddyAPI() {
  const apiKey = process.env.TADDY_API_KEY;
  const userId = process.env.TADDY_USER_ID;
  
  console.log('🔑 API Key:', apiKey ? 'Present' : 'Missing');
  console.log('👤 User ID:', userId ? 'Present' : 'Missing');
  
  if (!apiKey || !userId) {
    console.error('❌ Missing API credentials');
    return;
  }

  const graphqlQuery = {
    query: `
      query SearchEpisodes($term: String!) {
        searchForTerm(term: $term, filterForTypes: [PODCASTEPISODE]) {
          searchId
          podcastEpisodes {
            uuid
            name
            description
            episodeNumber
            seasonNumber
            duration
            isExplicit
            audioUrl
            audioLength
            datePublished
            podcastSeries {
              uuid
              name
              author
              imageUrl
              categories
              language
              rssUrl
            }
          }
        }
      }
    `,
    variables: {
      term: 'comedy'
    }
  };

  try {
    console.log('🚀 Testing Taddy API...');
    const response = await axios.post('https://api.taddy.org/graphql', graphqlQuery, {
      headers: {
        'X-API-KEY': apiKey,
        'X-USER-ID': userId,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Response Status:', response.status);
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    
    const episodes = response.data.data?.searchForTerm?.podcastEpisodes || [];
    console.log(`🎧 Found ${episodes.length} episodes`);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testTaddyAPI();
