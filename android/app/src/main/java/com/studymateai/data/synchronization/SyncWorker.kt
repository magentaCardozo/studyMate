package com.studymateai.data.synchronization

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.studymateai.app.StudyMateApp
import com.studymateai.core.network.isNetwork
import com.studymateai.core.network.toUserMessage
import java.util.concurrent.TimeUnit

/**
 * Synchronisation différée via WorkManager. WorkManager ne garantit pas une exécution
 * immédiate : l'interface propose aussi « Synchroniser maintenant ».
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as StudyMateApp).container
        if (!container.tokens.isLoggedIn) return Result.success()
        return try {
            container.sync.sync()
            Result.success()
        } catch (e: Exception) {
            container.prefs.syncFailed(e.toUserMessage())
            if (e.isNetwork() && runAttemptCount < 5) Result.retry() else Result.failure()
        }
    }

    companion object {
        private val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        /** Planifie une synchronisation dès que le réseau est disponible (après une modification locale). */
        fun requestSoon(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync-now", ExistingWorkPolicy.REPLACE, request)
        }

        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(constraints).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancelAll(context: Context) = WorkManager.getInstance(context).cancelAllWork()
    }
}
