import SwiftUI
import UIKit

/* ---------------- Prompt 37: Bibel-siden (Mer → Bibel, bare for brukere med modulen) ---------------- */
// Fasit: design/Bibelvers.dc.html → mode="page" (pageVals). Rekke-kort (indigo, gyllen glød, flamme og ukeprikker),
// dagens vers (Jeg har lest · ♡ Lagre · ✦ Forklar · Kopier), leseplan (chips, fremdrift, I DAG + Les › og Ferdig),
// statistikk, lagrede vers og daglig påminnelse kl. 07.

struct Bible37Page: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        // Prompt 39: 14 pt mellom alle kort, og første kort starter 16 pt under hero (siden overlapper hero med 23 pt).
        VStack(alignment: .leading, spacing: 14) {
            if m.enabled {
                Bible37StreakCard()
                Bible37TodayCard()
                Bible37PlanCard()
                Bible37StatsRow()
                Bible37SavedCard()
                Bible37ReminderRow()
            } else {
                PCard {
                    Text("Bibelvers er ikke slått på for denne brukeren. En administrator kan slå det på under Brukere → Moduler.")
                        .font(PF.ui(14)).foregroundStyle(p.mut).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        // Prompt 40: første kort («1 dag på rad») ligger oppe i skybildet: hele overlappet (36 pt) styres av PaperPage.
        .padding(.top, 0)
        .task { await m.load(store) }
    }
}

struct Bible37StreakCard: View {
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        let t: BibleTone37 = BibleTone37(morning: false)
        let read: Bool = m.readToday
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                Bible37Flame(on: read)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(m.streak) " + (m.streak == 1 ? "dag på rad" : "dager på rad")).font(PF.serif(30, medium: true)).foregroundStyle(t.fg)
                    Text("LENGSTE \(m.best) " + (m.best == 1 ? "DAG" : "DAGER")).font(PF.mono(10.5)).tracking(1.2).foregroundStyle(t.lab)
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 0) {
                ForEach(Array(m.week.enumerated()), id: \.offset) { _, w in
                    Bible37Dot(letter: w.0, read: w.1, today: w.2)
                        .frame(maxWidth: .infinity)
                }
            }
            Text(read ? "Bra! Kom tilbake i morgen." : "Les dagens vers for å holde rekken på \(m.streak) " + (m.streak == 1 ? "dag." : "dager."))
                .font(PF.ui(13)).foregroundStyle(t.mut)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.background(24))
        // Prompt 40: løfter seg fra hero-bildet, alle fire hjørner runde.
        .shadow(color: Color.black.opacity(0.35), radius: 15, y: 14)
    }
}

struct Bible37Flame: View {
    @Environment(\.accessibilityReduceMotion) private var reduce
    let on: Bool
    @State private var wob: Bool = false

    var body: some View {
        Image(systemName: "flame.fill").font(.system(size: 26, weight: .semibold))
            .foregroundStyle(on ? Color.white : Color(hex: "#f3efe6").opacity(0.55))
            .rotationEffect(.degrees(on && wob && !reduce ? 6 : 0))
            .frame(width: 56, height: 56)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(on ? AnyShapeStyle(LinearGradient(colors: [Color(hex: "#ffb067"), Color(hex: "#e8573a")], startPoint: .top, endPoint: .bottom))
                             : AnyShapeStyle(Color(hex: "#f3efe6").opacity(0.12)))
            )
            .shadow(color: on ? Color(hex: "#e8573a").opacity(0.6) : .clear, radius: 12, y: 8)
            .onAppear {
                if on && !reduce { withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { wob = true } }
            }
            .accessibilityHidden(true)
    }
}

struct Bible37Dot: View {
    let letter: String
    let read: Bool
    let today: Bool

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle().fill(read ? Color(hex: "#ffb067") : Color.white.opacity(0.1)).frame(width: 30, height: 30)
                if read { Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundStyle(Color(hex: "#2b2350")) }
            }
            .overlay(Circle().stroke(today ? Color(hex: "#ffd9c2") : Color.clear, lineWidth: 2).padding(-3))
            Text(letter).font(PF.mono(10.5)).foregroundStyle(Color(hex: "#f3efe6").opacity(0.6))
        }
    }
}

struct Bible37TodayCard: View {
    @Environment(Store.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduce
    @MainActor private var m: Bible37Model { Bible37Model.shared }
    @State private var copied: Bool = false

    var body: some View {
        let v: Verse37 = m.current
        let t: BibleTone37 = BibleTone37(morning: Bible37.period() == "morning")
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("DAGENS VERS").font(PF.mono(10.5)).tracking(1.4).foregroundStyle(t.lab)
                Spacer(minLength: 6)
                Text(Bible37.dateShort()).font(PF.mono(11, bold: false)).foregroundStyle(t.mut)
            }
            Text("«" + v.text + "»").font(PF.italic(22)).foregroundStyle(t.fg).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Text(v.ref).font(PF.ui(14, .bold)).foregroundStyle(t.fg)
            // Prompt 38: Glimt i prestedrakt (72 pt) leser verset med deg (Shared/Glimt38Priest.swift).
            HStack(spacing: 12) {
                Glimt38PriestFig(id: Glimt35Model.shared.cfg.host, size: 72, mood: Glimt35Voice.shared.speaking == nil ? .idle : .talk, still: reduce)
                Text("Glimt leser dagens vers med deg").font(PF.ui(13, .semibold)).foregroundStyle(t.mut)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            readButton(t)
            HStack(spacing: 8) {
                chip(m.isSaved(v) ? "♥ Lagret" : "♡ Lagre", t) { m.toggleSave(v) }
                chip(m.explaining ? "✦ Tenker …" : "✦ Forklar", t) { m.explainVerse(v, store) }
                chip(copied ? "Kopiert" : "Kopier", t) { copy(v) }
                Spacer(minLength: 0)
            }
            if !m.explain.isEmpty {
                Text(m.explain).font(PF.ui(13.5)).foregroundStyle(t.fg).lineSpacing(2)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(t.chip, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(t.background(24))
    }

    @ViewBuilder private func readButton(_ t: BibleTone37) -> some View {
        if m.readToday {
            Text("✓ Lest i dag").font(PF.ui(14, .bold)).foregroundStyle(Color.white)
                .frame(maxWidth: .infinity).frame(height: 44)
                .background(Color(hex: "#2f7a4f"), in: Capsule())
        } else {
            Button { m.markRead(store) } label: {
                Text("Jeg har lest").font(PF.ui(14, .bold)).foregroundStyle(t.morning ? Color(hex: "#f3efe6") : Color(hex: "#1b1a17"))
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(t.morning ? Color(hex: "#3b2a1a") : Color(hex: "#f3efe6"), in: Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    private func chip(_ s: String, _ t: BibleTone37, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            Text(s).font(PF.ui(12.5, .bold)).foregroundStyle(t.fg)
                .padding(.horizontal, 12).frame(height: 32)
                .background(t.chip, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func copy(_ v: Verse37) {
        UIPasteboard.general.string = v.copyText
        Haptics.shared.success()
        withAnimation(.easeOut(duration: 0.15)) { copied = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            withAnimation(.easeOut(duration: 0.15)) { copied = false }
        }
    }
}

struct Bible37PlanCard: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @Environment(\.openURL) private var openURL
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        let pl: BiblePlan37 = m.plan
        let frac: Double = Double(Swift.min(m.planDay, pl.days)) / Double(Swift.max(1, pl.days))
        PCard {
            VStack(alignment: .leading, spacing: 12) {
                PLabel(text: "Leseplan")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(BiblePlan37.all) { (x: BiblePlan37) in
                            planChip(x)
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    GeometryReader { (g: GeometryProxy) in
                        ZStack(alignment: .leading) {
                            Capsule().fill(p.line)
                            Capsule().fill(p.pos).frame(width: Swift.max(6, g.size.width * CGFloat(frac)))
                        }
                    }
                    .frame(height: 6)
                    Text("Dag \(m.planDay) av \(pl.days)").font(PF.ui(12.5)).foregroundStyle(p.mut)
                }
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("I DAG").font(PF.mono(10)).tracking(1.2).foregroundStyle(p.mut)
                        Text(pl.chapter(m.planDay)).font(PF.serif(20, medium: true)).foregroundStyle(p.ink)
                    }
                    Spacer(minLength: 6)
                    Button { read(pl) } label: {
                        Text("Les ›").font(PF.ui(13, .bold)).foregroundStyle(p.ink)
                            .padding(.horizontal, 14).frame(height: 36)
                            .overlay(Capsule().stroke(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    Button { m.planDone(store) } label: {
                        Text(m.planDoneToday ? "✓ Ferdig" : "Ferdig").font(PF.ui(13, .bold)).foregroundStyle(m.planDoneToday ? Color.white : p.bg)
                            .padding(.horizontal, 14).frame(height: 36)
                            .background(m.planDoneToday ? p.pos : p.ink, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(m.planDoneToday)
                }
            }
        }
    }

    private func planChip(_ x: BiblePlan37) -> some View {
        let on: Bool = x.id == m.planId
        return Button { m.choosePlan(x.id) } label: {
            Text(x.name + " · \(x.days) d").font(PF.ui(12.5, .semibold)).foregroundStyle(on ? p.bg : p.ink)
                .padding(.horizontal, 12).frame(height: 32)
                .background(on ? p.ink : p.card, in: Capsule())
                .overlay(Capsule().stroke(on ? p.ink : p.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func read(_ pl: BiblePlan37) {
        let q: String = pl.chapter(m.planDay).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let u = URL(string: "https://www.bibel.no/nettbibelen?query=" + q) { openURL(u) }
    }
}

struct Bible37StatsRow: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        let pct: Int = Int((Double(Swift.max(0, m.planDay - 1)) / Double(Swift.max(1, m.plan.days)) * 100).rounded())
        HStack(spacing: 8) {
            stat("\(m.readDays.count)", "dager lest")
            stat("\(m.saved.count)", "lagrede vers")
            stat("\(pct) %", "leseplan")
        }
    }

    private func stat(_ v: String, _ k: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(v).font(PF.serif(24, medium: true)).foregroundStyle(p.ink)
            Text(k).font(PF.ui(12)).foregroundStyle(p.mut)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

struct Bible37SavedCard: View {
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        PCard {
            VStack(alignment: .leading, spacing: 10) {
                PLabel(text: "Lagrede vers")
                if m.saved.isEmpty {
                    Text("Trykk Lagre på dagens vers for å samle vers her.").font(PF.ui(13.5)).foregroundStyle(p.mut)
                } else {
                    ForEach(m.saved, id: \.ref) { (v: Verse37) in
                        row(v)
                    }
                }
            }
        }
    }

    private func row(_ v: Verse37) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("«" + v.text + "»").font(PF.italic(16)).foregroundStyle(p.ink).fixedSize(horizontal: false, vertical: true)
                Text(v.ref).font(PF.ui(12.5, .bold)).foregroundStyle(p.mut)
            }
            Spacer(minLength: 4)
            Button { m.removeSaved(v) } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.mut)
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Fjern " + v.ref)
        }
    }
}

struct Bible37ReminderRow: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        Button { m.setReminder(!m.reminder, store) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Daglig påminnelse").font(PF.ui(15, .bold)).foregroundStyle(p.ink)
                    Text("Kl. 07:00 «Dagens vers er klart» · kl. 21 hvis rekken står i fare").font(PF.ui(12.5)).foregroundStyle(p.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Pkg37Switch(on: m.reminder)
            }
            .padding(14)
            .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Innstillinger → Glimt → Bibelvers (bare for brukere med modulen).
struct Bible37SettingsBlock: View {
    @Environment(Store.self) private var store
    @Environment(\.paper) private var p
    @MainActor private var m: Bible37Model { Bible37Model.shared }

    var body: some View {
        if m.enabled {
            VStack(alignment: .leading, spacing: 8) {
                PLabel(text: "Bibelvers")
                VStack(spacing: 0) {
                    row("I morgenbriefen", m.inMorning) { m.inMorning.toggle(); m.saveSettings(store) }
                    Rectangle().fill(p.line).frame(height: 1)
                    row("I kveldsbriefen", m.inEvening) { m.inEvening.toggle(); m.saveSettings(store) }
                    Rectangle().fill(p.line).frame(height: 1)
                    row("Varsel kl. 07:00 og 21:00", m.reminder) { m.setReminder(!m.reminder, store) }
                }
                .padding(.horizontal, 14)
                .background(p.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                Text("Oversettelse: Bibelen 1930 (Det Norske Bibelselskap).").font(PF.ui(12)).foregroundStyle(p.mut)
            }
        }
    }

    private func row(_ t: String, _ on: Bool, _ act: @escaping () -> Void) -> some View {
        Button(action: act) {
            HStack {
                Text(t).font(PF.ui(15, .semibold)).foregroundStyle(p.ink)
                Spacer(minLength: 8)
                Pkg37Switch(on: on)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
