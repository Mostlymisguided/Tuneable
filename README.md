# Tuneable 🎵

**A democratic music curation platform for group listening experiences**

Tuneable is a social music platform that empowers communities to collectively curate and enjoy music together. Built as a registered **Community Interest Company (CIC)**, we're committed to creating positive social impact through music while ensuring artists receive fair compensation.

## 🎯 Mission

Tuneable is legally committed to using our assets and profits for the benefit of the community. We're not driven by shareholder returns, but by our mission to:

- **Promote healing and communication through music**
- **Democratically and transparently chart the global music catalogue**
- **Empower artists by encouraging users to pay a fair price for music**
- **Promote the adoption of more resonant musical tuning standards** (e.g., A4 = 432hz)
- **Provide participatory musical experiences** in public and private spaces
- **Support sound healing initiatives** and mobile/floating wellness venues

## ✨ Current Features

### 🎪 Party System
- **Create and join music listening parties** (public, private, global, or tag-based)
- **Democratic queue management** - users tip/bid on songs to influence playlist order
- **Real-time synchronization** via WebSocket for live party updates
- **Persistent web player** supporting YouTube videos and MP3 audio files
- **Party types**: Remote, live, global, and tag-based parties

### 💰 Fair Compensation Model
- **Current fee structure**: 70% to artists, 30% platform fee
- **Artist escrow system** - automatic allocation of tips to verified creators
- **Media ownership tracking** - supports multiple owners with percentage-based revenue distribution
- **Unclaimed funds protection** - artists can claim earnings when they register

> **Our Commitment**: We are committed to reducing the current 30% commission when the platform is up and running and financially stable. Our goal is to maximize artist earnings while maintaining platform sustainability.

### 🎨 Unified Media Platform
- **Multi-content support**: Music, podcasts, video, images, and written content
- **Creator verification system** with role-based attribution (artist, producer, featuring, etc.)
- **Content relationships** - track remixes, covers, samples, and creative lineage
- **Platform-agnostic sources** - YouTube, Spotify, Apple Music, direct uploads, and more

### 👥 User Features
- **OAuth authentication** (Google, Facebook, Instagram, SoundCloud)
- **Digital wallet** for tipping on songs
- **TuneBytes reward system** - earn rewards for discovering and supporting music early
- **Creator dashboard** - manage media, view earnings, and request payouts
- **Real-time notifications** for bids, comments, and platform updates

### 🔒 Community Governance
- **CIC Status**: Registered Community Interest Company
- **Transparent governance** with open reporting on social impact
- **Community-first approach** - profits reinvested in community initiatives

## 🚀 Future Vision: Artist-Run DAO

Our long-term goal is to transition Tuneable into a **self-governing DAO (Decentralized Autonomous Organization) run by artists**. This will enable:

- **Artist-led governance** - creators make decisions about platform direction
- **Democratic voting** on platform policies, fee structures, and feature development
- **Community ownership** - artists and active community members share in platform governance
- **Transparent decision-making** through on-chain voting and proposals
- **Sustainable artist economy** - platform economics designed by and for creators

## 🛠️ Technology Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **Socket.io** for real-time communication
- **Stripe** for payment processing
- **AWS S3** for media storage
- **JWT** authentication
- **OAuth 2.0** integrations

### Frontend
- **React 19** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **Zustand** for state management
- **React Router** for navigation
- **Socket.io Client** for real-time updates

## 📦 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or Atlas)
- AWS S3 bucket (for file uploads)
- Stripe account (for payments)
- OAuth app credentials (Google, Facebook, Instagram, SoundCloud - optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd TuneableLocal
   ```

2. **Install backend dependencies**
   ```bash
   cd tuneable-backend
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd ../tuneable-frontend-v2
   npm install
   ```

4. **Set up environment variables**
   
   Backend (`tuneable-backend/.env`):
   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   STRIPE_SECRET_KEY=your_stripe_secret_key
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_S3_BUCKET=your_s3_bucket_name
   # OAuth credentials (optional)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   # ... other OAuth credentials
   ```
   
   Frontend (`tuneable-frontend-v2/.env`):
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```

5. **Run the development servers**
   
   Backend:
   ```bash
   cd tuneable-backend
   npm run dev
   ```
   
   Frontend:
   ```bash
   cd tuneable-frontend-v2
   npm run dev
   ```

## 📁 Project Structure

```
TuneableLocal/
├── tuneable-backend/          # Backend API server
│   ├── models/                # Mongoose models (User, Media, Party, Bid, etc.)
│   ├── routes/                # Express route handlers
│   ├── services/              # Business logic services
│   ├── middleware/            # Auth and validation middleware
│   ├── utils/                 # Utility functions
│   └── scripts/               # Migration and utility scripts
│
├── tuneable-frontend-v2/      # React frontend application
│   ├── src/
│   │   ├── components/        # Reusable React components
│   │   ├── pages/             # Page components
│   │   ├── stores/            # Zustand state management
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Frontend utilities
│   └── public/                # Static assets
│
└── docs/                      # Documentation files
```

## 🤝 Contributing

We welcome contributions! As a CIC, we're building this platform for the community, by the community. If you're interested in helping:

1. Review our mission and values
2. Check existing issues or propose new features
3. Submit pull requests with clear descriptions
4. Help with documentation, testing, or bug fixes

## 📄 License

Tuneable Community License v1.0 - See LICENSE file for details

This license requires a minimum 11% contribution to Tuneable CIC for any deployments that generate revenue or serve users.

## 🌐 Links

- **Website**: [https://tuneable.stream](https://tuneable.stream)
- **Discord**: [https://discord.gg/hwGMZV89up](https://discord.gg/hwGMZV89up)
- **Documentation**: See `/docs` directory for detailed guides
- **Status**: Currently in active development

## 💬 Contact

For questions, partnerships, or to get involved:
- **Email**: [t@tuneable.stream](mailto:t@tuneable.stream)
- **Discord**: [Join our community](https://discord.gg/hwGMZV89up)
- **GitHub Issues**: For technical questions and bug reports

---

**Built with ❤️ for the music community**

*Tuneable CIC - Legally committed to community benefit*
