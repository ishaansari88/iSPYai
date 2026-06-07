import UIKit

// MARK: - ViewController
// Demo host-app screen. This simulates how a developer at Practina (or any
// integrating team) would wire iSpyAI into an existing view controller.
//
// Integration steps mirrored here:
//   1. Make network calls through APIService (which has NetworkInterceptor configured).
//   2. Present DebugViewController whenever the developer wants to inspect traffic.

final class ViewController: UIViewController {

    // MARK: - UI Components

    private lazy var logoLabel: UILabel = {
        let l = UILabel()
        l.text          = "🕵️ iSpyAI"
        l.font          = .systemFont(ofSize: 34, weight: .heavy)
        l.textAlignment = .center
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private lazy var taglineLabel: UILabel = {
        let l = UILabel()
        l.text          = "iOS Network Debugger SDK"
        l.font          = .systemFont(ofSize: 16, weight: .regular)
        l.textColor     = .secondaryLabel
        l.textAlignment = .center
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private lazy var divider: UIView = {
        let v = UIView()
        v.backgroundColor = .separator
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }()

    private lazy var simulateButton: UIButton = {
        var cfg = UIButton.Configuration.filled()
        cfg.title         = "Simulate API Call"
        cfg.image         = UIImage(systemName: "arrow.triangle.2.circlepath")
        cfg.imagePadding  = 10
        cfg.cornerStyle   = .large
        cfg.baseBackgroundColor = .systemBlue
        let btn = UIButton(configuration: cfg)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: #selector(didTapSimulate), for: .touchUpInside)
        return btn
    }()

    #if ISPYAI_ENABLED
    private lazy var debugButton: UIButton = {
        var cfg = UIButton.Configuration.tinted()
        cfg.title        = "Open Debug Panel"
        cfg.image        = UIImage(systemName: "ladybug.fill")
        cfg.imagePadding = 10
        cfg.cornerStyle  = .large
        let btn = UIButton(configuration: cfg)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: #selector(didTapDebugPanel), for: .touchUpInside)
        return btn
    }()
    #endif

    private lazy var statusLabel: UILabel = {
        let l = UILabel()
        l.text          = "Ready — tap above to start."
        l.font          = .systemFont(ofSize: 13)
        l.textColor     = .secondaryLabel
        l.textAlignment = .center
        l.numberOfLines = 0
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private lazy var spinner: UIActivityIndicatorView = {
        let s = UIActivityIndicatorView(style: .medium)
        s.hidesWhenStopped = true
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    private lazy var logCountBadge: UILabel = {
        let l = UILabel()
        l.font              = .systemFont(ofSize: 12, weight: .semibold)
        l.textColor         = .white
        l.backgroundColor   = .systemRed
        l.textAlignment     = .center
        l.layer.cornerRadius = 10
        l.clipsToBounds     = true
        l.isHidden          = true
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "iSpyAI Demo"
        view.backgroundColor = .systemBackground
        buildLayout()
        observeNewLogs()
    }

    // MARK: - Layout

    private func buildLayout() {
        #if ISPYAI_ENABLED
        let buttonStack = UIStackView(arrangedSubviews: [simulateButton, debugButton])
        #else
        let buttonStack = UIStackView(arrangedSubviews: [simulateButton])
        #endif
        buttonStack.axis    = .vertical
        buttonStack.spacing = 12
        buttonStack.translatesAutoresizingMaskIntoConstraints = false

        let mainStack = UIStackView(arrangedSubviews: [
            logoLabel, taglineLabel, divider, buttonStack, spinner, statusLabel
        ])
        mainStack.axis    = .vertical
        mainStack.spacing = 16
        mainStack.translatesAutoresizingMaskIntoConstraints = false
        mainStack.setCustomSpacing(4,  after: logoLabel)
        mainStack.setCustomSpacing(24, after: taglineLabel)
        mainStack.setCustomSpacing(24, after: divider)
        mainStack.setCustomSpacing(4,  after: spinner)

        view.addSubview(mainStack)

        #if ISPYAI_ENABLED
        view.addSubview(logCountBadge)
        #endif

        var constraints: [NSLayoutConstraint] = [
            mainStack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            mainStack.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            mainStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            mainStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            simulateButton.heightAnchor.constraint(equalToConstant: 52),
            divider.heightAnchor.constraint(equalToConstant: 1)
        ]

        #if ISPYAI_ENABLED
        constraints += [
            debugButton.heightAnchor.constraint(equalToConstant: 52),
            logCountBadge.topAnchor.constraint(equalTo: debugButton.topAnchor, constant: -8),
            logCountBadge.trailingAnchor.constraint(equalTo: debugButton.trailingAnchor, constant: 8),
            logCountBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 20),
            logCountBadge.heightAnchor.constraint(equalToConstant: 20)
        ]
        #endif

        NSLayoutConstraint.activate(constraints)
    }

    // MARK: - Log Observer
    // Keeps the count badge in sync as new logs arrive from any call.

    private func observeNewLogs() {
        #if ISPYAI_ENABLED
        LogManager.shared.onNewLog = { [weak self] _ in
            DispatchQueue.main.async { self?.updateBadge() }
        }
        #endif
    }

    private func updateBadge() {
        #if ISPYAI_ENABLED
        let count = LogManager.shared.allLogs().count
        logCountBadge.isHidden = count == 0
        logCountBadge.text     = "  \(count)  "
        #endif
    }

    // MARK: - Actions

    @objc private func didTapSimulate() {
        setLoading(true)
        updateStatus("Fetching https://jsonplaceholder.typicode.com/posts/1 …")

        APIService.shared.get(urlString: "https://jsonplaceholder.typicode.com/posts/1") { [weak self] result in
            guard let self else { return }
            self.setLoading(false)

            switch result {
            case .success:
                self.updateStatus("✅ Log captured! Open the Debug Panel to inspect it.")
                self.updateBadge()
            case .failure(let error):
                self.updateStatus("❌ Request failed: \(error.localizedDescription)")
            }
        }
    }

    @objc private func didTapDebugPanel() {
        #if ISPYAI_ENABLED
        let debugVC = DebugViewController()
        let nav     = UINavigationController(rootViewController: debugVC)
        nav.modalPresentationStyle = .pageSheet
        present(nav, animated: true) { [weak self] in
            self?.updateBadge()
        }
        #endif
    }

    // MARK: - Helpers

    private func setLoading(_ loading: Bool) {
        simulateButton.isEnabled = !loading
        loading ? spinner.startAnimating() : spinner.stopAnimating()
    }

    private func updateStatus(_ message: String) {
        statusLabel.text = message
    }
}
