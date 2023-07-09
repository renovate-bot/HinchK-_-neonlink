import { imgUrlToBase64 } from "../../../helpers/images.js";
import { netscape } from "../../../helpers/netscape.js";
import { requireSession } from "../../../logics/handlers.js";
import { appContext } from "../../../contexts/appContext.js";

/**
 *
 * @param {import("fastify").FastifyInstance} fastify
 * @param {*} opts
 */
export default async function (fastify, opts) {
  fastify.get(
    "/",
    { preHandler: requireSession },
    async function (request, reply) {
      let query = new URLSearchParams(request.query);
      let offset = query.get("offset") ?? undefined;
      let limit = query.get("limit") ?? undefined;
      let q = query.get("q") ?? undefined;
      let tag = query.get("tag") ?? undefined;
      let category = query.get("category") ?? undefined;

      return appContext.stores.bookmarks.getPage(limit, offset, q, tag, category);
    }
  );

  fastify.get(
    "/:id",
    { preHandler: requireSession },
    async function (request, reply) {
      let { id } = request.params;
      let foundBookmark = appContext.stores.bookmarks.getItemById(id);
      if (foundBookmark) return foundBookmark;
      throw fastify.httpErrors.notFound(`bookmark with id ${id} not found`);
    }
  );

  fastify.get(
    "/:id/icon",
    { preHandler: requireSession },
    async function (request, reply) {
      let { id } = request.params;
      let icon = appContext.stores.bookmarks.getIconByBookmarkId(id);
      if (icon) {
        let type = icon.split(";")[0].split(":")[1];
        reply
          .type(type)
          .send(
            Buffer.from(icon.replace(/^data:\w+\/.+;base64,/, ""), "base64")
          );
        return;
      }
      throw fastify.httpErrors.notFound(`bookmark with id ${id} not found`);
    }
  );

  fastify.get(
    "/export",
    { preHandler: requireSession },
    async function (request, reply) {
      let bookmarks = appContext.stores.bookmarks.getAll();
      let maped = {};
      for (const key in bookmarks) {
        if (bookmarks.hasOwnProperty(key)) {
          const element = bookmarks[key];
          maped[element.title] = element.url;
        }
      }
      return netscape(maped);
    }
  );

  fastify.get(
    "/category/:id",
    { preHandler: requireSession },
    async function (request, reply) {
      let { id } = request.params;
      let bookmarks = appContext.stores.bookmarks.getByCategoryId(id);
      if (bookmarks) return bookmarks;
      throw fastify.httpErrors.notFound(
        `bookmarks with category id ${id} not found`
      );
    }
  );

  fastify.post(
    "/",
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: "object",
          required: ["url", "title"],
          properties: {
            url: { type: "string" },
            title: { type: "string" },
            desc: { type: "string" },
            icon: { type: "string" },
            categoryId: { type: "number" },
            tags: { type: "array", items: { type: "string" }, maxItems: 10 },
          },
        },
      },
    },
    async function (request, reply) {
      let { url, title, desc, icon, categoryId, tags } = request.body;
      if (url === "" || title === "")
        throw fastify.httpErrors.notAcceptable(
          "Url and title shoud not be empty string"
        );

      if (icon !== "") icon = await imgUrlToBase64(icon);

      let existingBookmark = appContext.stores.bookmarks.getItemByUrl(url);
      if (existingBookmark) {
        throw fastify.httpErrors.badRequest(
          "Bookmark with this url is already exist"
        );
      }
      reply.statusCode = 201;
      return appContext.stores.bookmarks.addItem(url, title, desc, icon, categoryId, tags);
    }
  );

  fastify.post(
    "/addArray",
    {
      schema: {
        body: {
          type: "array",
          items: {
            type: "object",
            required: ["url", "title"],
            properties: {
              url: { type: "string" },
              title: { type: "string" },
            },
          },
        },
      },
    },
    async function (request, reply) {
      let urlArray = request.body;
      urlArray.forEach((item) => {
        let { url, title, icon } = item;
        if (url === "")
          throw fastify.httpErrors.notAcceptable(
            `url shoud not be empty ${title}`
          );
        let existingBookmark = appContext.stores.bookmarks.getItemByUrl(url);
        if (existingBookmark) return;
        appContext.stores.bookmarks.addItem(url, title, "", icon, undefined, []);
        reply.statusCode = 201;
      });
      return true;
    }
  );

  fastify.put(
    "/:id",
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string" },
            title: { type: "string" },
            desc: { type: "string" },
            icon: { type: "string" },
            categoryId: { type: "number" },
            tags: { type: "array", items: { type: "string" }, maxItems: 10 },
          },
        },
      },
    },
    async function (request, reply) {
      let { id } = request.params;
      let { url, title, desc, icon, categoryId, tags } = request.body;
      if (url === "") throw new Error("Url shoud not be empty string");
      if (icon && icon.startsWith("http")) icon = await imgUrlToBase64(icon);
      if (
        appContext.stores.bookmarks.updateItem(
          id,
          url,
          title,
          desc,
          icon,
          categoryId,
          tags
        )
      )
        return { url, title, desc };
      throw fastify.httpErrors.notFound();
    }
  );

  fastify.delete(
    "/:id",
    { preHandler: requireSession },
    async function (request, reply) {
      let { id } = request.params;
      if (appContext.stores.bookmarks.deleteItem(id)) return true;
      else throw fastify.httpErrors.notFound();
    }
  );

  fastify.put(
    "/changePositions",
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: "object",
          properties: {
            categoryId: { type: "number" },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "position"],
                properties: {
                  id: { type: "number" },
                  position: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    async function (request, reply) {
      let { items, categoryId } = request.body;
      if (appContext.stores.bookmarks.updatePositions(items, categoryId)) return true;
      return { items, categoryId };
    }
  );
}
