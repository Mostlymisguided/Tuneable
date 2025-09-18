import React from 'react';
import { Heart, Globe, Music, Users, Shield, Waves } from 'lucide-react';

const About: React.FC = () => {
  const aims = [
    {
      icon: <Heart className="h-8 w-8 text-pink-500" />,
      title: "Promote healing and communication through music",
      description: "We believe music has the power to heal and connect people across all boundaries."
    },
    {
      icon: <Globe className="h-8 w-8 text-blue-500" />,
      title: "Democratically and transparently chart the global music catalogue",
      description: "Creating a fair and open system for discovering and promoting music worldwide."
    },
    {
      icon: <Music className="h-8 w-8 text-purple-500" />,
      title: "Empower artists by encouraging users to pay a fair price for music",
      description: "Supporting creators through fair compensation and direct fan engagement."
    },
    {
      icon: <Waves className="h-8 w-8 text-green-500" />,
      title: "Promote the adoption of more resonant musical tuning standards such as A4 = 432hz",
      description: "Advocating for natural tuning that resonates with human consciousness and nature."
    },
    {
      icon: <Users className="h-8 w-8 text-orange-500" />,
      title: "Provide participatory musical experiences in public and private spaces",
      description: "Creating inclusive spaces where everyone can contribute to the musical experience."
    },
    {
      icon: <Shield className="h-8 w-8 text-indigo-500" />,
      title: "Support sound healing initiatives + mobile and floating wellness venues",
      description: "Integrating music therapy and healing practices into our platform and community."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: '25px' }}>

      {/* CIC Information */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6" style={{ paddingTop: '30px', paddingBottom: '30px' }}>
              Community Interest Company
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed mb-8">
              As a registered CIC, Tuneable is legally committed to using our assets and profits 
              for the benefit of the community. We're not driven by shareholder returns, but by 
              our mission to create positive social impact through music.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Community First</h3>
                <p className="text-gray-600 text-sm">Profits reinvested in community initiatives</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Transparent Governance</h3>
                <p className="text-gray-600 text-sm">Open reporting on our social impact</p>
              </div>
              <div className="bg-white rounded-lg p-6 shadow-md">
                <h3 className="font-semibold text-gray-900 mb-2">Social Mission</h3>
                <p className="text-gray-600 text-sm">Legally bound to community benefit</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Aims Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Our Mission
            </h2>
            <p className="text-xl text-gray-600">
              Building a better musical future for everyone
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {aims.map((aim, index) => (
              <div key={index} className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-shadow text-center">
                <div className="flex justify-center mb-4">
                  {aim.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {aim.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {aim.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-gradient-to-r from-purple-600 to-indigo-600 text-white" style={{ marginBottom: '50px' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6" style={{ paddingTop: '30px', paddingBottom: '30px' }}>
            Join Our Musical Revolution
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Be part of a community that's reshaping how music brings people together
          </p>
          <div className="flex flex-col sm:flex-row justify-center" style={{ gap: '50px' }}>
            <a
              href="/register"
              className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              style={{ textDecoration: 'none' }}
            >
              Get Started
            </a>
            <a
              href="/parties"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-purple-600 transition-colors"
              style={{ textDecoration: 'none' }}
            >
              Explore Parties
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
