// The project was called BULL RUN for its first hours on bullrun.osmankng.workers.dev. It is BEARPROOF now.
// Every old URL keeps working: 301 to the same path on https://bearproof.app.
export default {
    fetch(request) {
        const url = new URL(request.url);
        return Response.redirect(`https://bearproof.app${url.pathname}${url.search}`, 301);
    }
};
