/**
 * Strips HTML tags from a string and returns plain text.
 * Also handles HTML entities like &nbsp;, &lt;, &gt;, etc.
 * 
 * @param html - The HTML string to strip
 * @returns Plain text with HTML tags removed
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  
  let text = html;
  
  // Remove HTML tags (including self-closing tags)
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
  
  // Decode numeric entities (&#123; or &#x1a;)
  text = text.replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec));
  text = text.replace(/&#x([a-f\d]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  // Clean up multiple spaces and newlines
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

