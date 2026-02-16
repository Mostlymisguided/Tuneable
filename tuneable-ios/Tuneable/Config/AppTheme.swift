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
