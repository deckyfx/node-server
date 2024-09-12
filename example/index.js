const { server, get, template, json, text, file } = require("../dist"); // * or require("@decky.fx/node-server");

const hostname = "0.0.0.0";
const port = 3000;

get("/", async (req, res, data) => {
  const session = data.session;
  if (session) {
    session.remove("greet");
  }
  text(res, "OK");
  return true;
});

get("/page2", async (req, res, data) => {
  const cookies = data.cookies?.get() || {};
  const session = data.session?.get() || {};
  json(res, session);
  return true;
});

get("/template", async (req, res, data) => {
  const template_file = file("server", "views", "home.html");

  res.end(
    template(template_file, {
      greet: "Helloooo From Server Side",
      loop: 5,
      arr: [
        "a",
        "b",
        {
          c: "c",
          d: "d",
        },
      ],
    })
  );
  return true;
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
