package com.victor.iptvnator;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * The focus of the Media3 controls must read from the sofa on any picture:
 * a double ring (light inside, dark outside) that grows the focused button,
 * and a time bar thumb that grows into the same ring. Checked on the
 * resources, since the unit tests have no Android views.
 */
public class PlayerFocusStyleTest {

    private static final String ANDROID = "http://schemas.android.com/apk/res/android";
    private static final File RES = new File("src/main/res");

    @Test
    public void everyControlButtonDrawsTheFocusRingAndGrows() throws Exception {
        Element button = style("ExoStyledControls.Button");

        assertEquals("@drawable/player_focus_ring", item(button, "android:foreground"));
        assertEquals("@animator/player_focus_scale", item(button, "android:stateListAnimator"));
        // Overriding the library style replaces it: keep what Media3 set,
        // with a round highlight under the round ring.
        assertEquals("?android:attr/selectableItemBackgroundBorderless", item(button, "android:background"));
        assertEquals("fitXY", item(button, "android:scaleType"));
    }

    @Test
    public void theSeekButtonsDrawTheRingInsteadOfMedia3sOwnForeground() throws Exception {
        for (String name : new String[] {
            "ExoStyledControls.Button.Center.RewWithAmount",
            "ExoStyledControls.Button.Center.FfwdWithAmount",
        }) {
            Element button = style(name);
            assertEquals(name, "@drawable/player_focus_ring", item(button, "android:foreground"));
            // The icon is the button's background, with the seconds on top.
            assertTrue(name, item(button, "android:background").startsWith("@drawable/exo_styled_controls_"));
            assertEquals(name, "center|bottom", item(button, "android:gravity"));
        }
    }

    @Test
    public void theRingIsLightInsideAndDarkOutsideOnlyWhenFocused() throws Exception {
        Element focused = focusedItem(xml("drawable/player_focus_ring.xml"));
        List<Element> layers = children(firstChild(focused, "layer-list"), "item");

        assertEquals(2, layers.size());
        assertTrue(isDark(strokeColor(layers.get(0))));
        assertTrue(isLight(strokeColor(layers.get(1))));
        // Inset, so a grown button at the screen edge keeps the whole ring.
        assertTrue(dp(layers.get(0).getAttributeNS(ANDROID, "top")) > 0);
        assertTrue(dp(layers.get(1).getAttributeNS(ANDROID, "top")) > dp(layers.get(0).getAttributeNS(ANDROID, "top")));
    }

    @Test
    public void theFocusedButtonGrowsALittle() throws Exception {
        Element focused = focusedItem(xml("animator/player_focus_scale.xml"));
        NodeList animators = focused.getElementsByTagName("objectAnimator");

        assertEquals(2, animators.getLength());
        for (int i = 0; i < animators.getLength(); i++) {
            float to = Float.parseFloat(((Element) animators.item(i)).getAttributeNS(ANDROID, "valueTo"));
            assertTrue(to > 1.05f && to <= 1.2f);
        }
    }

    @Test
    public void theTimeBarThumbGrowsIntoTheRingWhenFocused() throws Exception {
        Element timeBar = style("ExoStyledControls.TimeBar");
        assertEquals("@drawable/player_scrubber", item(timeBar, "scrubber_drawable"));
        assertEquals("bottom", item(timeBar, "bar_gravity"));

        Element selector = xml("drawable/player_scrubber.xml");
        Element focused = focusedItem(selector);
        Element normal = children(selector, "item").get(1);

        // Both states are the same size, so the bar reserves room for the
        // grown thumb; only the visible disc changes.
        List<Element> ring = children(firstChild(focused, "layer-list"), "item");
        List<Element> plain = children(firstChild(normal, "layer-list"), "item");
        assertEquals(size(ring.get(0)), size(plain.get(0)));
        assertTrue(isDark(solidColor(ring.get(0))));
        assertTrue(isLight(solidColor(ring.get(1))));
        assertTrue(dp(plain.get(1).getAttributeNS(ANDROID, "top")) > dp(ring.get(1).getAttributeNS(ANDROID, "top")));
    }

    private static Element xml(String path) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        Document document = factory.newDocumentBuilder().parse(new File(RES, path));
        return document.getDocumentElement();
    }

    private static Element style(String name) throws Exception {
        for (Element style : children(xml("values/styles.xml"), "style")) {
            if (name.equals(style.getAttribute("name"))) return style;
        }
        throw new AssertionError("No style " + name);
    }

    private static String item(Element style, String name) {
        for (Element item : children(style, "item")) {
            if (name.equals(item.getAttribute("name"))) return item.getTextContent().trim();
        }
        return null;
    }

    private static Element focusedItem(Element selector) {
        Element first = children(selector, "item").get(0);
        assertEquals("true", first.getAttributeNS(ANDROID, "state_focused"));
        return first;
    }

    private static List<Element> children(Element parent, String tag) {
        List<Element> result = new ArrayList<>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            if (nodes.item(i) instanceof Element && tag.equals(((Element) nodes.item(i)).getTagName())) {
                result.add((Element) nodes.item(i));
            }
        }
        return result;
    }

    private static Element firstChild(Element parent, String tag) {
        List<Element> found = children(parent, tag);
        assertTrue("No " + tag, !found.isEmpty());
        return found.get(0);
    }

    private static String strokeColor(Element layer) {
        Element stroke = (Element) layer.getElementsByTagName("stroke").item(0);
        assertNotNull(stroke);
        return stroke.getAttributeNS(ANDROID, "color");
    }

    private static String solidColor(Element layer) {
        Element solid = (Element) layer.getElementsByTagName("solid").item(0);
        assertNotNull(solid);
        return solid.getAttributeNS(ANDROID, "color");
    }

    private static String size(Element layer) {
        Element size = (Element) layer.getElementsByTagName("size").item(0);
        assertNotNull(size);
        return size.getAttributeNS(ANDROID, "width") + "x" + size.getAttributeNS(ANDROID, "height");
    }

    private static float dp(String value) {
        return value.isEmpty() ? 0 : Float.parseFloat(value.replace("dp", ""));
    }

    /** Average of the RGB channels of an #AARRGGBB or #RRGGBB colour. */
    private static int brightness(String color) {
        long argb = Long.parseLong(color.substring(1), 16);
        return (int) ((((argb >> 16) & 0xFF) + ((argb >> 8) & 0xFF) + (argb & 0xFF)) / 3);
    }

    private static boolean isDark(String color) {
        return brightness(color) < 64;
    }

    private static boolean isLight(String color) {
        return brightness(color) > 192;
    }
}
