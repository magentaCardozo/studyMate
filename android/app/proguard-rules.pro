# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.studymateai.** { *** Companion; }
-keepclasseswithmembers class com.studymateai.** { kotlinx.serialization.KSerializer serializer(...); }
# Retrofit
-keepattributes Signature, Exceptions
-keep,allowobfuscation interface com.studymateai.core.network.StudyMateApi
