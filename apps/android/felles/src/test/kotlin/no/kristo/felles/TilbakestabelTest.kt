package no.kristo.felles

import no.kristo.felles.navigasjon.Tilbakestabel
import no.kristo.felles.navigasjon.Tilbakesteg
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TilbakestabelTest {
    @Test fun lukkerDetOversteApneLagetFoerst() {
        var ark = true
        var detalj = true
        var side: String? = "mer/konto"
        val logg = ArrayList<String>()
        val t = Tilbakestabel(listOf(
            Tilbakesteg("ark", { ark }) { ark = false; logg += "ark" },
            Tilbakesteg("detalj", { detalj }) { detalj = false; logg += "detalj" },
            Tilbakesteg("mer-underside", { side != null && side != "mer" }) { side = "mer"; logg += "underside" },
            Tilbakesteg("mer", { side == "mer" }) { side = null; logg += "mer" },
        ))
        assertEquals("ark", t.rute())
        repeat(4) { assertTrue(t.tilbake()) }
        assertEquals(listOf("ark", "detalj", "underside", "mer"), logg)
        assertEquals(Tilbakestabel.ROT, t.rute())
        assertFalse("rotsiden: systemet tar over", t.tilbake())
    }

    @Test(expected = IllegalArgumentException::class) fun navneneErUnike() {
        Tilbakestabel(listOf(Tilbakesteg("a", { true }) {}, Tilbakesteg("a", { false }) {}))
    }
}
