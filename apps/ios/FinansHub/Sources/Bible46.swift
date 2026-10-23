import SwiftUI
import UIKit

/* ---------------- Prompt 46: Bibel-siden på iPad (claude-code-bibel-side-ipad-fold.md) ----------------
 Fasit: Bibelvers.dc.html → mode="page" (grid repeat(auto-fit, minmax(min(100%, 330px), 1fr))).
 – Smal (telefon, iPad i smal Split View): én kolonne i samme rekkefølge som før.
 – Bred (≥ 680 pt): venstre = Rekke + Dagens vers; høyre = Leseplan, statistikk, lagrede vers, påminnelse.
   Toppjustert, 14 pt mellom kort og 18 pt mellom kolonnene. Maks 1100 pt (Paper.swift). Bytter ved rotasjon uten å miste
   tilstand (kortene leser Bible37Model.shared, så lest/forklaring/plan blir stående). */

struct Bible46Layout: View {
    @State private var width: CGFloat = 0

    var body: some View {
        Group {
            if width >= 680 { two } else { one }
        }
        .background(GeometryReader { (g: GeometryProxy) in
            Color.clear
                .onAppear { width = g.size.width }
                .onChange(of: g.size.width) { (_: CGFloat, v: CGFloat) in width = v }
        })
    }

    private var one: some View {
        VStack(alignment: .leading, spacing: 14) {
            Bible37StreakCard()
            Bible37TodayCard()
            Bible37PlanCard()
            Bible37StatsRow()
            Bible37SavedCard()
            Bible37ReminderRow()
        }
    }

    private var two: some View {
        HStack(alignment: .top, spacing: 18) {
            VStack(alignment: .leading, spacing: 14) {
                Bible37StreakCard()
                Bible37TodayCard()
            }
            .frame(maxWidth: .infinity, alignment: .top)
            VStack(alignment: .leading, spacing: 14) {
                Bible37PlanCard()
                Bible37StatsRow()
                Bible37SavedCard()
                Bible37ReminderRow()
            }
            .frame(maxWidth: .infinity, alignment: .top)
        }
    }
}
