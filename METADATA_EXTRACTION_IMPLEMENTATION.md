# Metadata Extraction Implementation

## Overview
Implemented comprehensive MP3 metadata extraction using the `music-metadata` library to automatically populate Media model fields from uploaded audio files.

## Features Implemented

### 1. Metadata Extractor Service (`utils/metadataExtractor.js`)
- **Extract metadata from file buffers** using `music-metadata` library
- **Process and save artwork** from embedded images
- **Map extracted data** to Media model format
- **Validate metadata quality** with warnings and errors
- **Support for R2 and local storage** for artwork

### 2. Enhanced Upload Route (`routes/mediaRoutes.js`)
- **Automatic metadata extraction** on file upload
- **User input takes priority** over extracted metadata
- **Fallback handling** if extraction fails
- **Artwork processing** and storage
- **Auto-assignment of ownership** to uploader

### 3. Test Scripts
- **`testMetadataExtraction.js`** - Test metadata extraction functionality
- **`compareMetadataToMediaModel.js`** - Compare extracted fields with Media model

## Extracted Metadata Fields

### Basic Information
- **Title** → `title`
- **Artist** → `artist` array
- **Album** → `album`
- **Year** → `releaseDate`
- **Genre** → `genres` array
- **Duration** → `duration`
- **Explicit** → `explicit`

### Technical Metadata
- **Bitrate** → `bitrate`
- **Sample Rate** → `sampleRate`
- **Channels** → `channels`
- **Codec** → `codec`
- **Lossless** → `lossless`

### Advanced Metadata
- **BPM** → `bpm`
- **Key** → `key`
- **ISRC** → `isrc`
- **UPC** → `upc`
- **Lyrics** → `lyrics`
- **Language** → `language`

### Creator Information
- **Producer** → `producer` array
- **Songwriter** → `songwriter` array
- **Composer** → `composer` array
- **Label** → `label` array
- **Publisher** → `publisher`

### Track Information
- **Track Number** → `trackNumber`
- **Total Tracks** → `totalTracks`
- **Disc Number** → `discNumber`
- **Total Discs** → `totalDiscs`

### Artwork
- **Embedded Images** → `coverArt` (processed and stored)
- **Multiple formats** supported (JPEG, PNG, etc.)

## Field Mapping Analysis

### ✅ Direct Mappings (17 fields)
- `title` → `title`
- `album` → `album`
- `duration` → `duration`
- `explicit` → `explicit`
- `bpm` → `bpm`
- `key` → `key`
- `isrc` → `isrc`
- `upc` → `upc`
- `lyrics` → `lyrics`
- `bitrate` → `bitrate`
- `sampleRate` → `sampleRate`
- `language` → `language`
- `trackNumber` → `trackNumber`
- `discNumber` → `discNumber`
- `publisher` → `publisher`
- `encodedBy` → `encodedBy`
- `comment` → `comment`

### 🔄 Complex Mappings (7 fields)
- `artist` → `artist` array (with user verification)
- `genre` → `genres` array
- `year` → `releaseDate` (Date object)
- `producer` → `producer` array
- `songwriter` → `songwriter` array
- `composer` → `composer` array
- `label` → `label` array

### ❌ Unmapped Fields (8 fields)
- `channels` - Not in Media model
- `codec` - Not in Media model
- `lossless` - Not in Media model
- `totalTracks` - Not in Media model
- `totalDiscs` - Not in Media model
- `barcode` - Not in Media model
- `encodedBy` - Not in Media model
- `comment` - Not in Media model

### ❌ Missing from Extracted (System Fields)
- `uuid` - System generated
- `addedBy` - System field
- `uploadedAt` - System field
- `mediaOwners` - System field
- `editHistory` - System field
- `contentType` - System field
- `contentForm` - System field
- `mediaType` - System field
- `sources` - System field
- `coverArt` - Processed separately
- `tags` - User input
- `description` - User input
- `verified` - System field
- `createdAt` - System field
- `updatedAt` - System field

## Usage

### 1. Install Dependencies
```bash
npm install music-metadata
```

### 2. Test Metadata Extraction
```bash
# Place a sample MP3 file at: tuneable-backend/uploads/sample.mp3
node scripts/testMetadataExtraction.js
```

### 3. Compare with Media Model
```bash
node scripts/compareMetadataToMediaModel.js
```

### 4. Upload with Metadata
The upload route now automatically extracts metadata from uploaded files and populates the Media model accordingly.

## Benefits

### 1. **Automatic Population**
- Reduces manual data entry
- Ensures consistent metadata structure
- Populates technical fields automatically

### 2. **Quality Validation**
- Warns about low bitrate/sample rate
- Validates required fields
- Provides quality indicators

### 3. **Artwork Processing**
- Extracts embedded artwork
- Stores in R2 or local storage
- Supports multiple formats

### 4. **Creator Verification**
- Auto-verifies uploader as artist
- Maps additional creators from metadata
- Maintains verification status

### 5. **Ownership Assignment**
- Auto-assigns 100% ownership to uploader
- Tracks ownership changes
- Maintains audit trail

## Technical Implementation

### Metadata Extraction Flow
1. **File Upload** → Extract metadata from buffer
2. **Artwork Processing** → Save embedded images
3. **Validation** → Check quality and completeness
4. **Mapping** → Convert to Media model format
5. **Priority Handling** → User input overrides extracted data
6. **Storage** → Save to database with ownership

### Error Handling
- **Graceful fallback** if extraction fails
- **Continue with manual input** if metadata unavailable
- **Log warnings** for quality issues
- **Validate required fields** before saving

### Performance Considerations
- **Async processing** for large files
- **Buffer-based extraction** (no temporary files)
- **Efficient artwork storage** with R2
- **Validation caching** for repeated uploads

## Future Enhancements

### 1. **Additional Audio Formats**
- Support for FLAC, WAV, AAC, OGG
- Format-specific metadata extraction
- Quality assessment per format

### 2. **Advanced Metadata**
- MusicBrainz integration
- Acoustic fingerprinting
- Genre classification
- Mood detection

### 3. **Batch Processing**
- Bulk metadata extraction
- Batch artwork processing
- Progress tracking for large uploads

### 4. **Metadata Validation**
- Cross-reference with external databases
- Duplicate detection
- Quality scoring

## Conclusion

The metadata extraction implementation provides a robust foundation for automatically populating Media model fields from uploaded audio files. It handles the complexity of metadata mapping while maintaining flexibility for user input and system requirements.

The system successfully maps **24 out of 32** extracted fields to the Media model, with the remaining fields being either system-generated or not applicable to the current schema. This represents a **75% mapping efficiency** for automatic metadata population.

**Next Steps:**
1. Test with real MP3 files
2. Validate field mappings
3. Implement additional audio format support
4. Add advanced metadata features
