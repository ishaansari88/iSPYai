import UIKit

// MARK: - DebugViewController
// The iSpyAI debug panel — a UITableView listing all captured API logs.
// Accessible from within the host app at any time (presented modally).
//
// Each row shows:
//   • Color-coded HTTP status badge (green/yellow/red)
//   • Endpoint path
//   • HTTP method
//   • Response time
//
// Tapping a row pushes LogDetailViewController for full inspection.

final class DebugViewController: UIViewController {

    // MARK: - State

    private var logs: [APILog] = []

    // MARK: - UI Components

    private lazy var tableView: UITableView = {
        let tv = UITableView(frame: .zero, style: .insetGrouped)
        tv.translatesAutoresizingMaskIntoConstraints = false
        tv.register(APILogCell.self, forCellReuseIdentifier: APILogCell.reuseID)
        tv.delegate   = self
        tv.dataSource = self
        tv.rowHeight  = 72
        return tv
    }()

    private lazy var emptyStateView: EmptyStateView = {
        let v = EmptyStateView()
        v.translatesAutoresizingMaskIntoConstraints = false
        v.isHidden = true
        return v
    }()

    private lazy var clearButton: UIBarButtonItem = {
        UIBarButtonItem(
            title: "Clear",
            style: .plain,
            target: self,
            action: #selector(didTapClear)
        )
    }()

    private lazy var refreshButton: UIBarButtonItem = {
        UIBarButtonItem(
            barButtonSystemItem: .refresh,
            target: self,
            action: #selector(didTapRefresh)
        )
    }()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "iSpyAI — Debug Panel"
        view.backgroundColor = .systemGroupedBackground
        navigationItem.rightBarButtonItems = [clearButton, refreshButton]
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(didTapClose)
        )
        setupLayout()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        reloadLogs()
    }

    // MARK: - Layout

    private func setupLayout() {
        view.addSubview(tableView)
        view.addSubview(emptyStateView)

        NSLayoutConstraint.activate([
            tableView.topAnchor.constraint(equalTo: view.topAnchor),
            tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            emptyStateView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            emptyStateView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            emptyStateView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 40),
            emptyStateView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -40)
        ])
    }

    // MARK: - Data

    private func reloadLogs() {
        // Show newest logs first for convenience.
        logs = LogManager.shared.allLogs().reversed()
        tableView.reloadData()
        updateEmptyState()
    }

    private func updateEmptyState() {
        let isEmpty = logs.isEmpty
        emptyStateView.isHidden = !isEmpty
        tableView.isHidden      = isEmpty
    }

    // MARK: - Actions

    @objc private func didTapClear() {
        LogManager.shared.clearLogs()
        reloadLogs()
    }

    @objc private func didTapRefresh() {
        reloadLogs()
    }

    @objc private func didTapClose() {
        dismiss(animated: true)
    }
}

// MARK: - UITableViewDataSource

extension DebugViewController: UITableViewDataSource {

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        logs.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: APILogCell.reuseID, for: indexPath) as! APILogCell
        cell.configure(with: logs[indexPath.row])
        return cell
    }

    func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        logs.isEmpty ? nil : "\(logs.count) request\(logs.count == 1 ? "" : "s") captured"
    }
}

// MARK: - UITableViewDelegate

extension DebugViewController: UITableViewDelegate {

    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        let detail = LogDetailViewController(log: logs[indexPath.row])
        navigationController?.pushViewController(detail, animated: true)
    }

    func tableView(
        _ tableView: UITableView,
        trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
    ) -> UISwipeActionsConfiguration? {
        let delete = UIContextualAction(style: .destructive, title: "Delete") { [weak self] _, _, done in
            guard let self else { done(false); return }
            let logToDelete = self.logs[indexPath.row]
            LogManager.shared.deleteLog(id: logToDelete.id)
            self.logs.remove(at: indexPath.row)
            tableView.deleteRows(at: [indexPath], with: .automatic)
            self.updateEmptyState()
            done(true)
        }
        delete.image = UIImage(systemName: "trash")
        return UISwipeActionsConfiguration(actions: [delete])
    }
}

// MARK: - APILogCell

/// Single-row cell displaying a color-coded status badge, path, method, and response time.
final class APILogCell: UITableViewCell {

    static let reuseID = "APILogCell"

    // MARK: - Subviews

    private let statusBadge: UILabel = {
        let l = UILabel()
        l.font          = .monospacedSystemFont(ofSize: 13, weight: .bold)
        l.textAlignment = .center
        l.layer.cornerRadius = 8
        l.clipsToBounds = true
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private let pathLabel: UILabel = {
        let l = UILabel()
        l.font          = .systemFont(ofSize: 14, weight: .medium)
        l.numberOfLines = 1
        l.lineBreakMode = .byTruncatingMiddle
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private let methodLabel: UILabel = {
        let l = UILabel()
        l.font      = .monospacedSystemFont(ofSize: 11, weight: .semibold)
        l.textColor = .systemBlue
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private let timeLabel: UILabel = {
        let l = UILabel()
        l.font      = .systemFont(ofSize: 11)
        l.textColor = .secondaryLabel
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    // MARK: - Init

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        accessoryType = .disclosureIndicator
        buildLayout()
    }

    required init?(coder: NSCoder) { fatalError("Use init(style:reuseIdentifier:)") }

    // MARK: - Layout

    private func buildLayout() {
        let metaRow = UIStackView(arrangedSubviews: [methodLabel, timeLabel])
        metaRow.axis    = .horizontal
        metaRow.spacing = 8
        metaRow.translatesAutoresizingMaskIntoConstraints = false

        let textStack = UIStackView(arrangedSubviews: [pathLabel, metaRow])
        textStack.axis    = .vertical
        textStack.spacing = 3
        textStack.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(statusBadge)
        contentView.addSubview(textStack)

        NSLayoutConstraint.activate([
            statusBadge.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
            statusBadge.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            statusBadge.widthAnchor.constraint(equalToConstant: 54),
            statusBadge.heightAnchor.constraint(equalToConstant: 30),

            textStack.leadingAnchor.constraint(equalTo: statusBadge.trailingAnchor, constant: 12),
            textStack.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -8),
            textStack.centerYAnchor.constraint(equalTo: contentView.centerYAnchor)
        ])
    }

    // MARK: - Configuration

    func configure(with log: APILog) {
        let color = statusColor(for: log.statusCode)

        statusBadge.text            = "\(log.statusCode)"
        statusBadge.textColor       = color
        statusBadge.backgroundColor = color.withAlphaComponent(0.12)

        pathLabel.text  = URL(string: log.endpoint)?.path.isEmpty == false
            ? URL(string: log.endpoint)?.path ?? log.endpoint
            : log.endpoint

        methodLabel.text = log.method
        timeLabel.text   = "\(Int(log.responseTime))ms"
    }

    private func statusColor(for code: Int) -> UIColor {
        switch code {
        case 200...299: return .systemGreen
        case 300...399: return .systemOrange
        case 400...499: return .systemYellow
        case 500...599: return .systemRed
        default:        return .systemGray
        }
    }
}

// MARK: - EmptyStateView

private final class EmptyStateView: UIView {

    override init(frame: CGRect) {
        super.init(frame: frame)

        let icon = UIImageView(image: UIImage(systemName: "antenna.radiowaves.left.and.right"))
        icon.tintColor     = .tertiaryLabel
        icon.contentMode   = .scaleAspectFit
        icon.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text          = "No logs captured yet"
        title.font          = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor     = .secondaryLabel
        title.textAlignment = .center

        let subtitle = UILabel()
        subtitle.text          = "Tap \"Simulate API Call\" on the main screen\nto capture your first request."
        subtitle.font          = .systemFont(ofSize: 14)
        subtitle.textColor     = .tertiaryLabel
        subtitle.textAlignment = .center
        subtitle.numberOfLines = 0

        let stack = UIStackView(arrangedSubviews: [icon, title, subtitle])
        stack.axis      = .vertical
        stack.spacing   = 10
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false

        addSubview(stack)

        NSLayoutConstraint.activate([
            icon.heightAnchor.constraint(equalToConstant: 56),
            icon.widthAnchor.constraint(equalToConstant: 56),

            stack.topAnchor.constraint(equalTo: topAnchor),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }

    required init?(coder: NSCoder) { fatalError() }
}
