package com.studymateai.domain

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * Répétition espacée (SM-2 adapté) — identique à backend/src/services/srs.ts, afin
 * qu'une révision faite hors ligne donne le même intervalle une fois synchronisée.
 *   0 = À revoir · 1 = Difficile · 2 = Compris · 3 = Facile
 */
data class SrsState(val easeFactor: Double, val intervalDays: Double, val repetitions: Int, val lapses: Int)

data class SrsResult(val state: SrsState, val dueAtMillis: Long)

object Srs {
    private const val MIN_EASE = 1.3
    private const val MAX_INTERVAL = 365.0

    fun schedule(s: SrsState, rating: Int, nowMillis: Long): SrsResult {
        var ease = s.easeFactor
        var interval: Double
        var reps = s.repetitions
        var lapses = s.lapses
        when (rating) {
            0 -> {
                lapses += 1; reps = 0
                ease = max(MIN_EASE, ease - 0.2)
                interval = 10.0 / (24 * 60)
            }
            1 -> {
                ease = max(MIN_EASE, ease - 0.15)
                interval = if (reps == 0) 1.0 else max(1.0, s.intervalDays * 1.2)
                reps += 1
            }
            2 -> {
                interval = when (reps) { 0 -> 1.0; 1 -> 3.0; else -> max(1.0, s.intervalDays * ease) }
                reps += 1
            }
            else -> {
                ease += 0.15
                interval = if (reps == 0) 3.0 else max(2.0, s.intervalDays * ease * 1.3)
                reps += 1
            }
        }
        interval = min(MAX_INTERVAL, (interval * 1000).roundToLong() / 1000.0)
        val roundedEase = (ease * 100).roundToLong() / 100.0
        return SrsResult(SrsState(roundedEase, interval, reps, lapses), nowMillis + (interval * 86_400_000).roundToLong())
    }
}
