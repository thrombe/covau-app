package com.thrombe.covau

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.MediaPlayer
import android.os.IBinder
import androidx.core.app.NotificationCompat

class PlayerService : Service() {
//    private lateinit var mediaPlayer: MediaPlayer

    private val NOTIFICATION_ID = 42
    private val CHANNEL_ID = "player_service_channel"

    companion object {
        public var isActive = false
    }

    override fun onCreate() {
        super.onCreate()
//        mediaPlayer = MediaPlayer()
        // Initialize your media player here

        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Start playing audio
//        mediaPlayer.start()

        // Create a notification for the foreground service
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        isActive = true

        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        isActive = false
//        mediaPlayer.stop()
//        mediaPlayer.release()
    }

    private fun createNotification(): Notification {
        // Build and return your notification here
        val notificationIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(this, 0, notificationIntent, PendingIntent.FLAG_MUTABLE)

        // Build the notification
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground) // Replace with your notification icon
            .setContentTitle("Playing Audio")
            .setContentText("Your audio is playing")
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            //.setStyle(Notification.MediaStyle()) // Optional: Use MediaStyle for better media controls
            .setOngoing(true) // Ongoing notification
            .build()
    }

    private fun createNotificationChannel() {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Player Service Channel",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Channel for audio playback service"
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }
}

//fun req_focus() {
//    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
//    val result = audioManager.requestAudioFocus(
//        { focusChange ->
//            when (focusChange) {
//                AudioManager.AUDIOFOCUS_GAIN -> mediaPlayer.start()
//                AudioManager.AUDIOFOCUS_LOSS -> mediaPlayer.pause()
//                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> mediaPlayer.pause()
//                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> mediaPlayer.setVolume(0.5f, 0.5f)
//            }
//        },
//        AudioManager.STREAM_MUSIC,
//        AudioManager.AUDIOFOCUS_GAIN
//    )
//
//    if (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
//        // Start playback
//    }
//}
