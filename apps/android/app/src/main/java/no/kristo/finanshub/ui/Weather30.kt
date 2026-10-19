package no.kristo.finanshub.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp

/*
 * Prompt 30 (ANDROID30): Yr- og Storm-logoen som ressurser (res/drawable-nodpi/yr_logo.png og storm_logo.png, kopiert fra
 * public/assets/brands/ som SERVER30 har beskåret til sirkelen: 256 × 256, gjennomsiktig utenfor, ingen hvit kant).
 * Hentes aldri fra nettet.
 */

/** Rund logo: kind = «yr» eller «storm». */
@Composable
internal fun BrandLogo30(kind: String, size: Dp, modifier: Modifier = Modifier) {
    Image(
        painterResource(if (kind == "storm") no.kristo.finanshub.R.drawable.storm_logo else no.kristo.finanshub.R.drawable.yr_logo), if (kind == "storm") "Storm" else "Yr", contentScale = ContentScale.Crop,
        modifier = modifier.size(size).clip(CircleShape),
    )
}
