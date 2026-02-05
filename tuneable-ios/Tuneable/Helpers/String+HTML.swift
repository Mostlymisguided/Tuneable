import Foundation

extension String {
    /// Returns plain text with HTML tags removed and common entities decoded.
    var strippingHTML: String {
        var s = self
        // Remove script/style blocks (content between tags, including newlines)
        while let r = s.range(of: "<script[^>]*>[\\s\\S]*?</script>", options: [.regularExpression, .caseInsensitive]) {
            s.removeSubrange(r)
        }
        while let r = s.range(of: "<style[^>]*>[\\s\\S]*?</style>", options: [.regularExpression, .caseInsensitive]) {
            s.removeSubrange(r)
        }
        // Replace tags with space
        s = s.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        // Decode common entities
        s = s.replacingOccurrences(of: "&amp;", with: "&")
        s = s.replacingOccurrences(of: "&lt;", with: "<")
        s = s.replacingOccurrences(of: "&gt;", with: ">")
        s = s.replacingOccurrences(of: "&quot;", with: "\"")
        s = s.replacingOccurrences(of: "&#39;", with: "'")
        s = s.replacingOccurrences(of: "&apos;", with: "'")
        s = s.replacingOccurrences(of: "&nbsp;", with: " ")
        // Collapse whitespace and trim
        s = s.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
