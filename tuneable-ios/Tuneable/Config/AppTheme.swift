import SwiftUI

/// Theme matching the Tuneable web app: white text on purple gradient background.
enum AppTheme {
    // Web app body gradient: linear-gradient(135deg, #1A1A2E 0%, #4A2C81 50%, #3A1C71 100%)
    static let gradientStart = Color(red: 26/255, green: 26/255, blue: 46/255)   // #1A1A2E
    static let gradientMid   = Color(red: 74/255, green: 44/255, blue: 129/255) // #4A2C81
    static let gradientEnd   = Color(red: 58/255, green: 28/255, blue: 113/255)   // #3A1C71

    // Web app text color: #E5E7EB
    static let textPrimary   = Color(red: 229/255, green: 231/255, blue: 235/255)
    static let textSecondary  = Color(red: 229/255, green: 231/255, blue: 235/255).opacity(0.85)
    static let textTertiary   = Color(red: 229/255, green: 231/255, blue: 235/255).opacity(0.65)

    // Accent (purple) for buttons and highlights – web uses #9333ea
    static let accent = Color(red: 147/255, green: 51/255, blue: 234/255)
    static let accentLight = Color(red: 168/255, green: 85/255, blue: 247/255)

    // Metrics card borders (match web Party page)
    static let metricsTotalTipsBorder = Color(red: 234/255, green: 179/255, blue: 8/255)   // yellow/orange
    static let metricsAvgTipBorder = Color(red: 34/255, green: 197/255, blue: 94/255)       // green

    /// Full-screen purple gradient background matching the web app.
    static var gradient: LinearGradient {
        LinearGradient(
            colors: [gradientStart, gradientMid, gradientEnd],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    /// Card/surface background (semi-transparent dark)
    static let cardBackground = Color.white.opacity(0.08)
    static let cardBorder = Color.white.opacity(0.15)
}

/// A view that fills the available space with the app's purple gradient.
struct PurpleGradientBackground: View {
    var body: some View {
        AppTheme.gradient
            .ignoresSafeArea()
    }
}

/// View modifier to apply the standard purple gradient background.
struct PurpleGradientBackgroundModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(PurpleGradientBackground())
    }
}

extension View {
    /// Applies the Tuneable purple gradient as the background.
    func purpleGradientBackground() -> some View {
        modifier(PurpleGradientBackgroundModifier())
    }
}

/// Coloured initial used when a person has not uploaded a profile photo.
/// Palette and hash match the web and mobile apps.
enum UserLetterAvatar {
    static let defaultProfilePic = "https://uploads.tuneable.stream/profile-pictures/default-profile.png"

    private static let palette: [(Double, Double, Double)] = [
        (124, 58, 237),
        (147, 51, 234),
        (192, 38, 211),
        (219, 39, 119),
        (225, 29, 72),
        (234, 88, 12),
        (180, 83, 9),
        (5, 150, 105),
        (15, 118, 110),
        (2, 132, 199),
        (79, 70, 229),
        (109, 40, 217),
    ]

    static func customURL(_ raw: String?) -> URL? {
        guard let raw, !raw.isEmpty, raw != defaultProfilePic else { return nil }
        return URL(string: raw)
    }

    private static func normalized(_ name: String?) -> String {
        var trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasPrefix("@") {
            trimmed.removeFirst()
        }
        return trimmed
    }

    static func letter(for name: String?) -> String {
        let trimmed = normalized(name)
        guard let first = trimmed.first else { return "?" }
        return String(first).uppercased()
    }

    static func color(for name: String?) -> Color {
        let key = normalized(name).lowercased()
        guard !key.isEmpty else {
            return Color(red: 75 / 255, green: 85 / 255, blue: 99 / 255)
        }
        var hash: UInt32 = 0
        for unit in key.utf16 {
            hash = hash &* 31 &+ UInt32(unit)
        }
        let item = palette[Int(hash % UInt32(palette.count))]
        return Color(red: item.0 / 255, green: item.1 / 255, blue: item.2 / 255)
    }
}

struct UserLetterAvatarView: View {
    let name: String?

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            ZStack {
                Circle().fill(UserLetterAvatar.color(for: name))
                Text(UserLetterAvatar.letter(for: name))
                    .font(.system(size: max(CGFloat(8), side * 0.46), weight: .semibold))
                    .foregroundStyle(.white)
            }
        }
    }
}
