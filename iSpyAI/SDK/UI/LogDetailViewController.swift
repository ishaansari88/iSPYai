import UIKit

// MARK: - LogDetailViewController
// Full inspection screen for a single captured API log.
//
// Sections displayed (top to bottom):
//   1. AI Analysis  — actionable insight highlighted in blue
//   2. Endpoint     — full URL + HTTP method
//   3. Status & Timing
//   4. Request Headers (privacy-masked by LogManager before arrival)
//   5. Response Headers
//   6. Response Body (pretty-printed JSON when possible)

final class LogDetailViewController: UIViewController {

    private let log: APILog

    // MARK: - Init

    init(log: APILog) {
        self.log = log
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(log:)") }

    // MARK: - UI

    private lazy var scrollView: UIScrollView = {
        let sv = UIScrollView()
        sv.alwaysBounceVertical            = true
        sv.translatesAutoresizingMaskIntoConstraints = false
        return sv
    }()

    private lazy var contentStack: UIStackView = {
        let s = UIStackView()
        s.axis    = .vertical
        s.spacing = 14
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Log Detail"
        view.backgroundColor = .systemGroupedBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .action,
            target: self,
            action: #selector(didTapShare)
        )
        setupLayout()
        populateContent()
    }

    // MARK: - Layout

    private func setupLayout() {
        view.addSubview(scrollView)
        scrollView.addSubview(contentStack)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 20),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: 16),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -16),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -20),
            contentStack.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -32)
        ])
    }

    // MARK: - Content Population

    private func populateContent() {
        let analysis = LogManager.shared.analyze(log: log)

        contentStack.addArrangedSubview(
            makeCard(title: "AI Analysis", content: analysis, style: .highlighted)
        )

        contentStack.addArrangedSubview(
            makeCard(title: "Endpoint", content: "\(log.method)  \(log.endpoint)")
        )

        let timingText = """
        Status Code   : \(log.statusCode)
        Response Time : \(String(format: "%.2f", log.responseTime))ms
        Captured At   : \(formattedDate(log.timestamp))
        """
        contentStack.addArrangedSubview(
            makeCard(title: "Status & Timing", content: timingText)
        )

        contentStack.addArrangedSubview(
            makeCard(title: "Request Headers (masked)", content: formatHeaders(log.requestHeaders))
        )

        contentStack.addArrangedSubview(
            makeCard(title: "Response Headers", content: formatHeaders(log.responseHeaders))
        )

        contentStack.addArrangedSubview(
            makeCard(title: "Response Body", content: prettyPrint(log.responseBody))
        )
    }

    // MARK: - Card Builder

    private enum CardStyle { case normal, highlighted }

    private func makeCard(title: String, content: String, style: CardStyle = .normal) -> UIView {
        let isHighlighted = style == .highlighted

        let container = UIView()
        container.backgroundColor  = isHighlighted
            ? UIColor.systemBlue.withAlphaComponent(0.08)
            : .secondarySystemGroupedBackground
        container.layer.cornerRadius = 14
        container.layer.borderWidth  = isHighlighted ? 1 : 0
        container.layer.borderColor  = UIColor.systemBlue.withAlphaComponent(0.25).cgColor
        container.translatesAutoresizingMaskIntoConstraints = false

        let titleLabel = UILabel()
        titleLabel.text      = title.uppercased()
        titleLabel.font      = .systemFont(ofSize: 10, weight: .bold)
        titleLabel.textColor = isHighlighted ? .systemBlue : .tertiaryLabel
        titleLabel.letterSpacing(1.2)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        let contentLabel = UILabel()
        contentLabel.text          = content
        contentLabel.font          = .monospacedSystemFont(ofSize: 13, weight: .regular)
        contentLabel.numberOfLines = 0
        contentLabel.textColor     = .label
        contentLabel.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(titleLabel)
        container.addSubview(contentLabel)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: container.topAnchor, constant: 14),
            titleLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),

            contentLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            contentLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 16),
            contentLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -16),
            contentLabel.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -14)
        ])

        return container
    }

    // MARK: - Actions

    @objc private func didTapShare() {
        let summary = buildShareText()
        let activity = UIActivityViewController(activityItems: [summary], applicationActivities: nil)
        present(activity, animated: true)
    }

    // MARK: - Helpers

    private func formatHeaders(_ headers: [String: String]) -> String {
        guard !headers.isEmpty else { return "(none)" }
        return headers.sorted(by: { $0.key < $1.key })
                      .map { "  \($0.key): \($0.value)" }
                      .joined(separator: "\n")
    }

    private func prettyPrint(_ json: String) -> String {
        guard
            let data  = json.data(using: .utf8),
            let obj   = try? JSONSerialization.jsonObject(with: data),
            let pretty = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]),
            let str   = String(data: pretty, encoding: .utf8)
        else { return json }
        return str
    }

    private func formattedDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: date)
    }

    private func buildShareText() -> String {
        """
        iSpyAI — API Log Report
        ========================
        Endpoint : \(log.method) \(log.endpoint)
        Status   : \(log.statusCode)
        Time     : \(String(format: "%.2f", log.responseTime))ms
        Captured : \(formattedDate(log.timestamp))

        Analysis
        --------
        \(LogManager.shared.analyze(log: log))

        Response Body
        -------------
        \(prettyPrint(log.responseBody))
        """
    }
}

// MARK: - UILabel Extension

private extension UILabel {
    func letterSpacing(_ spacing: CGFloat) {
        guard let text else { return }
        let attributed = NSMutableAttributedString(string: text)
        attributed.addAttribute(.kern, value: spacing, range: NSRange(location: 0, length: text.count))
        attributedText = attributed
    }
}
