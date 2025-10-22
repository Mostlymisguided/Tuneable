import { useState, useCallback } from 'react';
import { parseBlob } from 'music-metadata';

export interface ExtractedMetadata {
  // Basic information
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  genre: string[] | null;
  trackNumber: number | null;
  totalTracks: number | null;
  discNumber: number | null;
  totalDiscs: number | null;
  
  // Technical metadata
  duration: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  codec: string | null;
  codecProfile: string | null;
  lossless: boolean;
  
  // Advanced metadata
  bpm: number | null;
  key: string | null;
  isrc: string | null;
  upc: string | null;
  lyrics: string | null;
  comment: string | null;
  
  // Creator information
  composer: string | null;
  songwriter: string | null;
  producer: string | null;
  publisher: string | null;
  label: string | null;
  encodedBy: string | null;
  
  // Content flags
  explicit: boolean;
  language: string | null;
  
  // Artwork
  artwork: Array<{
    type: string;
    format: string;
    data: Uint8Array;
  }>;
}

export interface MetadataExtractionState {
  isExtracting: boolean;
  extractedMetadata: ExtractedMetadata | null;
  error: string | null;
  warnings: string[];
}

export const useMetadataExtraction = () => {
  const [state, setState] = useState<MetadataExtractionState>({
    isExtracting: false,
    extractedMetadata: null,
    error: null,
    warnings: []
  });

  const extractMetadata = useCallback(async (file: File): Promise<ExtractedMetadata | null> => {
    setState(prev => ({
      ...prev,
      isExtracting: true,
      error: null,
      warnings: []
    }));

    try {
      console.log('🔍 Extracting metadata from:', file.name);
      
      const metadata = await parseBlob(file);
      
      // Extract basic metadata
      const extractedData: ExtractedMetadata = {
        // Basic information
        title: metadata.common.title || null,
        artist: metadata.common.artist || null,
        album: metadata.common.album || null,
        year: metadata.common.year || null,
        genre: metadata.common.genre || null,
        trackNumber: metadata.common.track?.no || null,
        totalTracks: metadata.common.track?.of || null,
        discNumber: metadata.common.disk?.no || null,
        totalDiscs: metadata.common.disk?.of || null,
        
        // Technical metadata
        duration: Math.floor(metadata.format.duration || 0),
        bitrate: metadata.format.bitrate || null,
        sampleRate: metadata.format.sampleRate || null,
        channels: metadata.format.numberOfChannels || null,
        codec: metadata.format.codec || null,
        codecProfile: metadata.format.codecProfile || null,
        lossless: metadata.format.lossless || false,
        
        // Advanced metadata
        bpm: metadata.common.bpm || null,
        key: metadata.common.key || null,
        isrc: metadata.common.isrc || null,
        upc: metadata.common.barcode || null,
        lyrics: metadata.common.lyrics?.[0]?.text || null,
        comment: metadata.common.comment?.[0] || null,
        
        // Creator information
        composer: metadata.common.composer || null,
        songwriter: metadata.common.songwriter || null,
        producer: metadata.common.producer || null,
        publisher: metadata.common.publisher || null,
        label: metadata.common.label || null,
        encodedBy: metadata.common.encodedBy || null,
        
        // Content flags
        explicit: metadata.common.explicit || false,
        language: metadata.common.language || null,
        
        // Artwork
        artwork: metadata.common.picture || []
      };

      // Validate extracted metadata
      const warnings: string[] = [];
      
      if (!extractedData.title) {
        warnings.push('No title found in metadata');
      }
      
      if (!extractedData.artist) {
        warnings.push('No artist found in metadata');
      }
      
      if (!extractedData.duration || extractedData.duration === 0) {
        warnings.push('No duration found in metadata');
      }
      
      if (extractedData.bitrate && extractedData.bitrate < 128000) {
        warnings.push('Low bitrate detected - audio quality may be poor');
      }
      
      if (extractedData.sampleRate && extractedData.sampleRate < 44100) {
        warnings.push('Low sample rate detected - audio quality may be poor');
      }
      
      if (!extractedData.artwork || extractedData.artwork.length === 0) {
        warnings.push('No artwork found in metadata');
      }

      console.log('✅ Metadata extraction successful:', {
        title: extractedData.title,
        artist: extractedData.artist,
        duration: extractedData.duration,
        bitrate: extractedData.bitrate,
        bpm: extractedData.bpm,
        artwork: extractedData.artwork.length
      });

      setState(prev => ({
        ...prev,
        isExtracting: false,
        extractedMetadata: extractedData,
        warnings
      }));

      return extractedData;

    } catch (error) {
      console.error('❌ Metadata extraction failed:', error);
      
      setState(prev => ({
        ...prev,
        isExtracting: false,
        error: error instanceof Error ? error.message : 'Failed to extract metadata',
        extractedMetadata: null
      }));

      return null;
    }
  }, []);

  const clearMetadata = useCallback(() => {
    setState({
      isExtracting: false,
      extractedMetadata: null,
      error: null,
      warnings: []
    });
  }, []);

  return {
    ...state,
    extractMetadata,
    clearMetadata
  };
};
