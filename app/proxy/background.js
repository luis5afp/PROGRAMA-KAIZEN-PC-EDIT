(async () => {
    async function setProxy(proxy) {
        if (!proxy) return setSystemProxy();
        let proxyArray = proxy.split("://")
        const pacScript = " function FindProxyForURL(url, host) { return '" + proxyArray[0].toUpperCase() + " " + proxyArray[1] + "; DIRECT' }"
        console.log(pacScript);
        
        const config = {
            mode: "pac_script",
            pacScript: {
                data: pacScript
            }
        };

        return new Promise(rs => {
            chrome.proxy.settings.set(
                { value: config, scope: "regular" },
                function () {
                    if (chrome.runtime.lastError) {
                        rs("Error:" + chrome.runtime.lastError)
                    } else {
                        rs(true)
                    }
                }
            );
        })

    }
    function setSystemProxy() {

        const config = {
            mode: "system"
        };

        chrome.proxy.settings.set(
            { value: config, scope: "regular" },
            function () {
                if (chrome.runtime.lastError) {
                    console.error("Error:", chrome.runtime.lastError);
                } else {
                    console.log("✓ Using system proxy settings");
                }
            }
        );
    }
    let reuslt = await setProxy('socks5://14abecf2ef98e:313a0d205c@149.18.54.47:12324');
    console.log(reuslt);

})()