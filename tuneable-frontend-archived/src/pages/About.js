import React from 'react';
import './About.css'; // Optional styling file

const About = () => {
  return (
    <div className="about-container">
      <section className="about-hero">
        <h1>🎶 About Tuneable</h1>
        <p>
          <strong>Tuneable</strong> is a social music app that puts the power of the playlist in your hands — and your friends’. Whether you're at a house party, a café, or a boat in the middle of nowhere, Tuneable lets everyone join the music conversation.
        </p>
        <p>
          No more fighting over the aux cable or suffering through someone else’s taste. With Tuneable, you can <strong>bid on songs</strong>, <strong>vote tracks to the top</strong>, and <strong>create shared queues in real time</strong> — democratically, dynamically, and with a little skin in the game.
        </p>
      </section>

      <section>
        <h2>✨ How it Works</h2>
        <ul>
          <li>Create or join a party</li>
          <li>Request songs from across major platforms</li>
          <li>Bid to boost your favourites</li>
          <li>Watch the queue evolve live</li>
        </ul>
        <p>The highest bid plays next — simple as that. It’s group listening, gamified.</p>
      </section>

      <section>
        <h2>🎯 Our Mission</h2>
        <p>
          <strong>Tuneable is a registered Community Interest Company (CIC)</strong>, built to benefit the wider community rather than private shareholders.
        </p>
        <p>
          Our aims include:
        </p>
         <ul>
    <li>Promote healing through music;</li>
    <li>Democratically chart global media;</li>
    <li>Empower creators by encouraging users to pay a fair price for music;</li>
    <li>More resonant tuning standards such as A4 = 432hz;</li>
    <li>Provide participatory musical experiences in public and private spaces;</li>
    <li>Support wellness initiatives such as sound therapy and mobile or floating healing venues.</li>
  </ul>
        <p>
          We believe music should bring people together — not just through algorithms, but through <em>intention</em> and <em>interaction</em>.
        </p>
      </section>

      <section>
        <h2>🛠️ Built For</h2>
        <ul>
          <li>Music lovers</li>
          <li>House party hosts</li>
          <li>Venues, bars, cafés</li>
          <li>Artists and DJs</li>
          <li>Curious minds and sonic explorers</li>
        </ul>
      </section>

      <section>
        <h2>🌍 Why Now?</h2>
        <p>
          There are over <strong>600 million music streaming subscribers</strong> globally. But most group settings still rely on whoever’s got the phone.
        </p>
        <p>
          Tuneable changes that. It's a live, local, collective jukebox — powered by community and backed by micropayments.
        </p>
      </section>

      <section>
        <h2>👥 Who We Are</h2>
        <p>
          A small crew of music-obsessed builders, designers, and dreamers — including musicians, developers, DJs, and a sprinkle of weirdos. Tuneable is independently built, community-driven, and open to collaboration.
        </p>
      </section>

      <section>
        <h2>🚀 What’s Next?</h2>
        <ul>
          <li>Full feature launch of the Tuneable jukebox</li>
          <li>Integrations with YouTube, Spotify, Apple Music & more</li>
          <li>TuneFeed – a global chart of the most-loved, most-paid-for songs</li>
          <li>Live events, venue partnerships, and IRL experiments</li>
        </ul>
      </section>

      <section className="about-cta">
        <h3>Want to help us test, invest, or jam?</h3>
        <p><a href="mailto:mostlymisguided@icloud.com">📧 Get in touch</a></p>
        <p><a href="https://www.tuneable.com/pitch-deck.pdf" target="_blank" rel="noreferrer">📄 See the pitch deck</a></p>
        <p><a href="/parties">🎉 Join a party</a></p>
      </section>
    </div>
  );
};

export default About;