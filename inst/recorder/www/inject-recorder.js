// This file is loaded by the recorder app.

window.recorder = (function() {
    var recorder = {
        token: randomId(),
        testEvents: []
    };


    // Code injection
    $(document).ready(function() {

        // Modify iframe's URL if we're being proxied by RStudio Server.
        function fixupIframeUrl() {
            var $iframe = $("#app-iframe");
            var orig_src = $iframe.attr("data-src");

            // If this app is NOT proxied by RStudio Server, set the iframe's src to
            // point to the data-src value.
            if (! /\/p\/[0-9]+\/$/.test(window.location.href)) {
                $iframe.attr("src", orig_src);
                return;
            }

            // If we are proxied by RStudio Server, rewrite the URL from something like
            //   http://127.0.0.1:4030
            // to
            //   https://username.rstudio.cloud/1234abcd/p/4030/
            var port = orig_src.replace(/.*:([0-9]+)\/?/, "$1");
            var new_src = window.location.href.replace(
                /\/p\/([0-9]+)\/$/,
                "/p/" + port + "/"
            );

            $iframe.attr("src", new_src);
        }
        fixupIframeUrl();

        function evalCodeInFrame(code) {
            var message = {
                token: "abcdef",
                code: code
            };
            $('#app-iframe')[0].contentWindow.postMessage(message, "*");
        }


        // Check that the frame is ready with its Shiny app
        var frameReadyChecker = window.setInterval(function() {
            if (status.frameReady) {
                injectRecorderJS();
                clearTimeout(frameReadyChecker);
                return;
            }

            console.log("Checking if frame is ready");

            // Find out when iframe app is ready - this tells it to send back
            // a message indicating that it's ready.
            evalCodeInFrame(
                "if (Shiny && Shiny.shinyapp && Shiny.shinyapp.config) {" +
                    "var message = {" +
                        "token: '" + recorder.token + "', " +
                        "frameReady: true " +
                    "};\n" +
                    "parent.postMessage(message, '*');" +
                "}"
            );
        }, 100);


        // Check that the parent frame has the output value with the
        // Javascript code.
        var recoderCodeReadyChecker = window.setInterval(function() {
            console.log("Checking if JS code is ready to be injected...");

            if (Shiny && Shiny.shinyapp && Shiny.shinyapp.$values &&
                Shiny.shinyapp.$values.recorder_js)
            {
                console.log("JS code is ready to be injected.");
                status.recorderCodeReady = true;
                clearTimeout(recoderCodeReadyChecker);
                injectRecorderJS();
            }
        }, 100);


        // Inject recorder code into iframe, but only if hasn't already been done.
        function injectRecorderJS() {
            if (!status.codeHasBeenInjected &&
                status.frameReady &&
                status.recorderCodeReady)
            {
                console.log("Injecting JS code.");
                evalCodeInFrame(Shiny.shinyapp.$values.recorder_js);
                evalCodeInFrame("window.shinyRecorder.token = '" + recorder.token + "';");
                status.codeHasBeenInjected = true;
            }
        }


        var status = {
            frameReady: false,
            recorderCodeReady: false,
            codeHasBeenInjected: false
        };


        // Set up message receiver. Code is evaluated with `status` as the
        // context, so that the value can be modified in the right place.
        window.addEventListener("message", function(e) {
            var message = e.data;
            if (message.token !== recorder.token)
                return;

            var html, evt;

            if (message.frameReady) {
                console.log("Frame is ready.");
                status.frameReady = true;

                recorder.testEvents.push({
                    type: "initialize",
                    time: Date.now()
                });
            }

            if (message.inputEvent) {
                evt = message.inputEvent;

                // Filter out clientdata items
                if (evt.name.indexOf(".clientdata") === 0)
                    return;

                recorder.testEvents.push({
                    type: "input",
                    inputType: evt.inputType,
                    name: evt.name,
                    value: evt.value,
                    hasBinding: evt.hasBinding,
                    time: Date.now()
                });

                // Send updated values to server
                Shiny.onInputChange("testevents:shinytest.testevents", recorder.testEvents);
            }

            if (message.fileDownload) {
                evt = message.fileDownload;

                recorder.testEvents.push({
                    type: "fileDownload",
                    name: evt.name,
                    time: Date.now()
                });

                // Send updated values to server
                Shiny.onInputChange("testevents:shinytest.testevents", recorder.testEvents);
            }

            if (message.outputEvent) {
                // We currently only care that an output event has happened,
                // but not its value.
                recorder.testEvents.push({
                    type: "outputEvent",
                    time: Date.now()
                });

                // Send updated values to server
                Shiny.onInputChange("testevents:shinytest.testevents", recorder.testEvents);
            }

            if (message.outputValue) {
                evt = message.outputValue;

                recorder.testEvents.push({
                    type: "outputValue",
                    name: evt.name,
                    value: evt.value,
                    time: Date.now()
                });

                // Send updated values to server
                Shiny.onInputChange("testevents:shinytest.testevents", recorder.testEvents);
            }

            (function() { eval(message.code); }).call(status);
        });

        $(document).on("shiny:inputchanged", function(event) {
            if (event.name === "snapshot") {
                recorder.testEvents.push({
                    type: "snapshot",
                    value: event.value,
                    time: Date.now()
                });

                // Send updated values to server
                Shiny.onInputChange("testevents:shinytest.testevents", recorder.testEvents);
            }
        });
    });


    // ------------------------------------------------------------------------
    // Utility functions
    // ------------------------------------------------------------------------
    function escapeHTML(str) {
      return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;")
                .replace(/\//g,"&#x2F;");
    }

    function escapeString(str) {
        return str.replace(/"/g, '\\"');
    }


    function randomId() {
        return Math.floor(0x100000000 + (Math.random() * 0xF00000000)).toString(16);
    }

    return recorder;
})();


// Scroll to bottom of recorded event table whenever new content is received.
$(document).on("shiny:value", function(event) {
    if (event.target.id === "recordedEvents") {
        var $el = $("#recorded-events");
        $el.animate({
            scrollTop: $el[0].scrollHeight
        }, 200);
    }
});
