// @input Component.ScreenTransform screenTransform
// @input float frequency
// @input float amplitude
// @input float duration
// @input float startValue
// @input float endValue
// @input float decay

var t = 0.0;
var startVal = script.startValue;
var endVal = script.endValue;
var dur = script.duration;
var f = script.frequency;
var dec = script.decay;

function reset() {
    t = 0.0;
}

var event = script.createEvent("UpdateEvent");
event.bind(function(eventData)
{       
    if (t < dur) {
        s = (t-0.0) / (dur-0.0) * (endVal - startVal) + startVal;
    }else{
        amp = (endVal - startVal)/dur*script.amplitude;
        w = f*Math.PI*2;
        s = endVal + amp*(Math.sin((t-dur)*w)/Math.exp(dec*(t-dur))/w);
    }
    script.screenTransform.scale = new vec3(s,s,s);
    t += getDeltaTime(); 
})

script.createEvent("TapEvent").bind(reset);