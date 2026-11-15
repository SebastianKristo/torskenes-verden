import Foundation

/* ---------------- Codable-DTO-er for kontrakten i shared/schemas/api ---------------- */
// Én struct per skjema (x-endpoint i hver fil). Feltene som er `required` i skjemaet er ikke-valgfrie her; resten er valgfrie,
// så et nytt felt på serveren aldri knekker dekodingen («felt legges til, ikke fjernes», shared/schemas/README.md).
// Navnene følger JSON-feltene (også de norske i /api/live). Beløp: `…Ore` er heltall i øre (fasit), ellers kroner (Double).
// Dekodes med APIClient.get/send (i aktøren, utenfor main actor). HomelabTests dekoder eksemplene i shared/schemas/eksempler.

/// Id som er tall eller tekst (types.schema.json#/$defs/id). Lagres som tekst.
struct LooseID: Codable, Hashable, Sendable {
    let value: String

    init(_ value: String) { self.value = value }

    init(from decoder: Decoder) throws {
        let c: SingleValueDecodingContainer = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) {
            value = String(i)
        } else if let d = try? c.decode(Double.self) {
            value = String(Int(d))
        } else {
            value = try c.decode(String.self)
        }
    }

    func encode(to encoder: Encoder) throws {
        var c: SingleValueEncodingContainer = encoder.singleValueContainer()
        try c.encode(value)
    }
}

/// Feil (common/error.schema.json).
struct APIErrorDTO: Codable, Sendable {
    let error: String
    let code: String
    let reason: String?
}

/// GET /api/version (uten innlogging).
struct VersionDTO: Codable, Sendable {
    let version: String?
    let minClient: String
    let contract: Int
    let api: Int
    let dbSchema: Int?
    let name: String?
    let codename: String?
    let shortName: String?
    let features: [String]
}

/// GET /api/me
struct MeDTO: Codable, Sendable {
    let id: String
    let username: String
    /// admin | bruker
    let role: String
    let name: String
    let displayName: String?
    let totp: Bool?
    let isMainAdmin: Bool?
    let avatarUrl: String?
    let serverName: String?
    let language: String?
    let media: Bool?
    let glimt_char: String?
    let glimt_char_source: String?
}

/// POST /finans/api/login
struct AuthTokenDTO: Codable, Sendable {
    struct User: Codable, Sendable {
        let id: String
        let username: String
        let role: String
        let name: String?
    }

    let token: String
    let scopes: [String]
    let user: User
    /// ms siden 1970 (eldre form).
    let expires: Int64
    let expiresAt: String
    let sliding: Bool?
}

/// GET /finans/api/tokens (tabell).
struct TokenDTO: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let scopes: [String]
    let created: Int64
    let lastUsed: Int64?
    let expires: Int64?
    let expired: Bool
    let sliding: Bool?
    let createdAt: String?
    let lastUsedAt: String?
    let expiresAt: String?
    let current: Bool?
}

/// GET /api/mobile/home
struct MobileHomeDTO: Codable, Sendable {
    struct Weather: Codable, Sendable {
        let place: String?
        let temp: Double?
        let hi: Double?
        let lo: Double?
        let sunrise: String?
        let sunset: String?
        let updated: String?
    }

    struct Shortcut: Codable, Sendable {
        let name: String
        let url: String
    }

    let name: String
    let serverName: String?
    let avatarUrl: String?
    let greeting: String
    let weather: Weather?
    let shortcuts: [Shortcut]?
}

/// GET /api/brief
struct BriefDTO: Codable, Sendable {
    struct Event: Codable, Sendable {
        let id: String?
        let title: String
        let date: String
        /// Tidspunkt (ISO) eller dato.
        let start: String?
        let end: String?
        let allDay: Bool?
    }

    struct Card: Codable, Sendable {
        let id: String
        let on: Bool
        let label: String?
    }

    let kind: String
    let title: String
    let greeting: String
    let summary: String?
    let events: [Event]?
    let generatedAt: String
    let nextAt: String?
    let deepLink: String?
    let cards: [Card]?
}

/// GET /api/brief/widget
struct BriefWidgetDTO: Codable, Sendable {
    struct Next: Codable, Sendable {
        let title: String
        let time: String?
        let label: String?
    }

    let kind: String
    let size: String?
    let title: String
    let summary: String
    let temp: Double?
    let hi: Double?
    let lo: Double?
    let next: Next?
    let deepLink: String?
    let generatedAt: String
    let refreshAt: String?
}

/// GET /api/dates/holidays?year= | from=&to=
struct DatesHolidaysDTO: Codable, Sendable {
    struct Item: Codable, Sendable, Hashable {
        let date: String
        let name: String
        /// helligdag | merkedag
        let type: String
        let fri: Bool
    }

    let from: String
    let to: String
    let items: [Item]
}

/// POST /api/dates/parse {text, now?}
struct DatesParseDTO: Codable, Sendable, Equatable {
    struct Problem: Codable, Sendable, Equatable {
        let field: String
        let message: String
    }

    let date: String?
    let time: String?
    let end: String?
    let allDay: Bool
    let rest: String
    let label: String?
    let today: String
    let dateText: String?
    let timeText: String?
    let errors: [Problem]
}

/// Kroppen til POST /api/dates/parse.
struct DatesParseRequest: Codable, Sendable {
    let text: String
    /// ISO 8601 med sone. nil = nå (serveren).
    let now: String?
}

/// GET /finans/api/subscriptions
struct FinansSubscriptionsDTO: Codable, Sendable {
    struct NextCharge: Codable, Sendable {
        let date: String
        let label: String?
    }

    struct Subscription: Codable, Sendable, Identifiable {
        let id: Int
        let name: String
        let plan: String?
        let price: Double
        let priceOre: Int
        /// weekly | biweekly | monthly | quarterly | halfyearly | yearly | biennial
        let cycle: String
        let nextDate: String?
        let monthly: Double
        let yearly: Double?
        let active: Bool
        let status: String?
        let category: String?
        let domain: String?
        let nextCharge: NextCharge?
        let mine: Bool?
        let shared: Bool?
        let cycleName: String?
        let perLabel: String?
    }

    struct Upcoming: Codable, Sendable {
        let id: Int
        let name: String
        let date: String
        let amount: Double
    }

    struct Cycle: Codable, Sendable {
        let id: String
        let name: String
        let perLabel: String
    }

    let items: [Subscription]
    let monthly: Double
    let yearly: Double
    let today: String
    let month: String?
    let upcoming: [Upcoming]?
    let cycles: [Cycle]?
    let categories: [String]?
}

/// En transaksjon (finans-transactions.schema.json#/$defs/transaction).
struct TransactionDTO: Codable, Sendable, Identifiable {
    let id: Int
    let date: String
    let amount: Double
    let amountOre: Int
    let description: String
    let merchant: String?
    let note: String?
    let source: String?
    let categoryId: Int?
    let category: String?
    /// expense | income | transfer
    let kind: String
    let accountId: Int?
    let account: String?
    let folderId: Int?
    let tags: [String]?
}

/// GET /finans/api/transactions
struct FinansTransactionsDTO: Codable, Sendable {
    struct Month: Codable, Sendable {
        let month: String
        let count: Int
        let net: Double?
        let inn: Double?
        let ut: Double?
    }

    let items: [TransactionDTO]
    let count: Int?
    let net: Double?
    let nextCursor: String?
    let months: [Month]?
}

/// GET /finans/api/summary
struct FinansSummaryDTO: Codable, Sendable {
    struct ByCategory: Codable, Sendable {
        let categoryId: Int?
        let category: String
        let amount: Double
        let budget: Double?
    }

    struct Budget: Codable, Sendable {
        let categoryId: Int?
        let category: String
        let budget: Double
        let used: Double
    }

    let month: String
    let from: String
    let to: String
    let daysLeft: Int?
    let inn: Double
    let ut: Double
    let budgetTotal: Double
    let budgetUsed: Double
    let left: Double
    let balance: Double
    let byCategory: [ByCategory]
    let budgets: [Budget]
    let recent: [TransactionDTO]
    let spentMonth: Double?
    let day: Int?
    let daysInMonth: Int?
}

/// GET /api/kalender
struct KalenderDTO: Codable, Sendable {
    struct Event: Codable, Sendable, Identifiable {
        let id: String
        let title: String
        /// Tidspunkt (ISO) eller dato (heldag).
        let start: String
        let end: String?
        let allDay: Bool
        let date: String
        let time: String?
        let type: String?
        let color: String?
        let source: String?
        let calendar: String?
        let editable: Bool?
        let recurring: Bool?
        let appCalendar: String?
        let note: String?
        let etag: String?
        let fri: Bool?
    }

    struct CalendarInfo: Codable, Sendable {
        let id: String
        let name: String
        let color: String?
        let writable: Bool?
        let enabled: Bool?
    }

    struct Source: Codable, Sendable {
        let id: String
        let name: String?
        let ok: Bool?
        let count: Int?
        let fetchedAt: String?
    }

    let from: String
    let to: String
    let today: String
    let events: [Event]
    let calendars: [CalendarInfo]
    let sources: [Source]?
    let updatedAt: String?
}

/// GET /api/live/aktiviteter (norske feltnavn, som appene leser dem).
struct LiveAktiviteterDTO: Codable, Sendable {
    struct Handling: Codable, Sendable {
        let id: String
        let tittel: String
    }

    struct Aktivitet: Codable, Sendable, Identifiable {
        let id: String
        let type: String
        let tittel: String
        let undertittel: String?
        let verdi: String?
        let progress: Double?
        let start: String?
        let slutt: String?
        let status: String
        let handlinger: [Handling]?
        let url: String?
    }

    let aktiviteter: [Aktivitet]
    let oppdatert: String
}

/// GET /api/media/status
struct MediaStatusDTO: Codable, Sendable {
    struct Service: Codable, Sendable, Identifiable {
        let id: String
        let service: String?
        let name: String
        let configured: Bool
        let ok: Bool?
        let connected: Bool?
        let state: String
        let version: String?
        let ms: Double?
        let lastOk: String?
        let text: String?
        let error: String?
    }

    let services: [Service]
    let admin: Bool?
    let canEdit: Bool?
}

/// GET /api/tasks
struct TasksDTO: Codable, Sendable {
    struct TaskList: Codable, Sendable, Identifiable {
        let id: String
        let name: String
        let color: String?
        let mine: Bool?
        let shared: Bool?
    }

    struct TaskItem: Codable, Sendable {
        let id: LooseID
        let title: String
        let list: String
        let due: String?
        let time: String?
        let done: Bool
        /// ms eller ISO (eldre svar).
        let doneAt: LooseID?
        let archived: Bool?
        let urgent: Bool?
        let prio: Int?
        let tags: [String]?
        let createdAt: Int64?
        let updatedAt: Int64?
        let createdAtIso: String?
        let updatedAtIso: String?
    }

    let lists: [TaskList]
    let items: [TaskItem]
    let archivedCount: Int?
    let today: String
    let listOrder: [String]?
}

/// GET /api/widgets/calendar
struct WidgetsCalendarDTO: Codable, Sendable {
    struct Event: Codable, Sendable {
        let id: String
        let title: String
        let date: String
        let start: String?
        let end: String?
        let allDay: Bool
        let time: String?
    }

    struct Day: Codable, Sendable {
        let date: String
        let label: String?
        let count: Int?
        let events: [Event]
    }

    let kind: String
    let today: Day
    let nextSchoolDay: Day?
    let next3: [Event]?
    let configured: Bool?
    let refreshAt: [String]?
    let updatedAt: String
    let deepLink: String?
}

/// GET /finans/api/faste-betalinger (Fase 6, Q4): Faste betalinger i Økonomi med filtrene Abonnementer, Faste utgifter og
/// Planlagte trekk. Serveren regner nextDate (Oslo), daysLeft, monthly, label og trekkdagene; appen viser dem. Beløp i kroner.
struct FasteBetalingerDTO: Codable, Sendable {
    struct Filter: Codable, Sendable, Identifiable, Hashable {
        /// abonnementer | faste | planlagte
        let id: String
        let name: String
        let count: Int
        let active: Int?
        let monthly: Double?
        let yearly: Double?
        let duplicates: Int?
        let total: Double?
        let days: Int?
    }

    struct Betaling: Codable, Sendable, Identifiable, Hashable {
        let key: String
        /// abonnement | fast
        let kind: String
        let id: Int
        let name: String
        let plan: String?
        let amount: Double
        let monthly: Double
        let yearly: Double
        let cycle: String
        let cycleName: String
        let perLabel: String
        let nextDate: String?
        let nextLabel: String?
        let daysLeft: Int?
        let label: String
        let active: Bool
        let category: String?
        let source: String
        let href: String
        /// En fast utgift for samme tjeneste som et abonnement: nøkkelen til abonnementet (telles ikke i summene).
        let duplicateOf: String?
    }

    struct ChargeDay: Codable, Sendable, Hashable {
        let day: Int
        let count: Int
        let names: [String]
    }

    struct Planlagt: Codable, Sendable, Hashable {
        let date: String
        let label: String
        /// abonnement | fast | funnet
        let kind: String
        let id: Int?
        let name: String
        let amount: Double
        let account: String?
        let source: String?
    }

    struct Planlagte: Codable, Sendable {
        let days: Int
        let from: String
        let to: String
        let total: Double
        let items: [Planlagt]
    }

    let today: String
    let month: String
    let filters: [Filter]
    let items: [Betaling]
    let monthly: Double
    let yearly: Double
    let chargeDays: [ChargeDay]
    let planned: Planlagte
}
