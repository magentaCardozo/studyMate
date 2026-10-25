package com.studymateai

import com.studymateai.domain.QuizScoring
import com.studymateai.domain.Srs
import com.studymateai.domain.SrsState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Vérifie que la logique hors ligne correspond exactement à celle du serveur. */
class DomainTest {
    private val fresh = SrsState(2.5, 0.0, 0, 0)
    private val now = 1_790_000_000_000L

    @Test fun `revisions reussies espacees comme sur le serveur`() {
        val r1 = Srs.schedule(fresh, 2, now)
        val r2 = Srs.schedule(r1.state, 2, r1.dueAtMillis)
        val r3 = Srs.schedule(r2.state, 2, r2.dueAtMillis)
        assertEquals(1.0, r1.state.intervalDays, 0.0)
        assertEquals(3.0, r2.state.intervalDays, 0.0)
        assertEquals(7.5, r3.state.intervalDays, 0.01)
    }

    @Test fun `a revoir reinitialise et reduit la facilite`() {
        val r = Srs.schedule(SrsState(2.5, 10.0, 4, 0), 0, now)
        assertEquals(0, r.state.repetitions)
        assertEquals(1, r.state.lapses)
        assertEquals(2.3, r.state.easeFactor, 0.0)
        assertTrue(r.dueAtMillis - now < 3_600_000)
    }

    @Test fun `correction locale tolere accents et casse`() {
        assertEquals(1.0, QuizScoring.score("FILL_BLANK", listOf("dérivée"), "DERIVEE"), 0.0)
        assertEquals(1.0, QuizScoring.score("SINGLE_CHOICE", 2.0, 2.0), 0.0)
        assertEquals(0.0, QuizScoring.score("TRUE_FALSE", true, false), 0.0)
        assertEquals(1.0, QuizScoring.score("MULTIPLE_CHOICE", listOf(0.0, 2.0), listOf(2.0, 0.0)), 0.0)
        assertEquals(0.5, QuizScoring.score("MATCHING", listOf(1.0, 0.0), listOf(1.0, 1.0)), 0.0)
    }
}
