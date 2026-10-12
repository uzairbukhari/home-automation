# kotlinx.serialization keeps its generated serializers via its own consumer rules.
-keepattributes *Annotation*, InnerClasses
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
# Models are decoded by kotlinx.serialization and referenced by name from WorkManager/manifest entries.
-keep class com.uzairbukhari.photon.data.** { *; }
-keep class com.uzairbukhari.photon.work.** { *; }
-keep class com.uzairbukhari.photon.widget.** { *; }
-keep class com.uzairbukhari.photon.tile.** { *; }
