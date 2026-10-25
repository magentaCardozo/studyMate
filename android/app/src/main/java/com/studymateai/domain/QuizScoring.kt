package com.studymateai.domain

import java.text.Normalizer

/** Correction locale des quiz d'entraînement hors ligne (mêmes règles que le serveur). */
object QuizScoring {
    fun normalize(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD)
        .replace("\\p{M}".toRegex(), "")
        .lowercase()
        .replace("[«»\"'’.,;:!?()]".toRegex(), " ")
        .replace("\\s+".toRegex(), " ")
        .trim()

    /** Renvoie le crédit obtenu (0..1). */
    fun score(type: String, correct: Any?, response: Any?): Double {
        if (response == null || response == "") return 0.0
        return when (type) {
            "SINGLE_CHOICE" -> if ((correct as? Number)?.toInt() == (response as? Number)?.toInt()) 1.0 else 0.0
            "TRUE_FALSE" -> if (correct == response) 1.0 else 0.0
            "MULTIPLE_CHOICE" -> {
                val c = (correct as? List<*>)?.map { (it as Number).toInt() }?.toSet()
                val r = (response as? List<*>)?.map { (it as Number).toInt() }?.toSet()
                if (c != null && c == r) 1.0 else 0.0
            }
            "MATCHING" -> {
                val c = (correct as? List<*>)?.map { (it as Number).toInt() } ?: return 0.0
                val r = (response as? List<*>)?.map { (it as Number).toInt() } ?: return 0.0
                if (c.isEmpty()) 0.0 else c.indices.count { r.getOrNull(it) == c[it] }.toDouble() / c.size
            }
            "SHORT_ANSWER", "FILL_BLANK" -> {
                val accepted = (correct as? List<*>)?.map { normalize(it.toString()) } ?: listOf(normalize(correct.toString()))
                if (normalize(response.toString()) in accepted) 1.0 else 0.0
            }
            else -> 0.0
        }
    }
}
