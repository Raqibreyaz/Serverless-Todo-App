import connectDb, { createObjectId, isValidObjectId } from "./db.js";
import { type APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";

const allowedHttpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE"]);
type HttpMethod = z.infer<typeof allowedHttpMethodSchema>;

const bodySchema = z.object({
  content: z.string().optional(),
  isCompleted: z.boolean().optional(),
});
type Body = z.infer<typeof bodySchema>;

export const lambdaFunction = async (event: APIGatewayProxyEventV2) => {
  try {
    const rawBody = event?.body;
    const path = event?.requestContext?.http?.path;
    const httpMethod: HttpMethod = allowedHttpMethodSchema.parse(
      event?.requestContext?.http?.method,
      { error: () => "invalid http method!" },
    );

    if (!httpMethod) throw new Error("http method is required!");
    if (!path) throw new Error("Path not supported!");

    // conditionally connect to DB
    const Todo = await connectDb();

    const todoId = path.split("/")[0];
    const body: Body = bodySchema.parse(rawBody ? JSON.parse(rawBody) : {});
    const todoContent = body.content;
    const isTodoCompleted = body.isCompleted;

    const handlers = {
      GET: async () => {
        if (!todoId) {
          const todos = await Todo.find().toArray();
          return {
            statusCode: 200,
            body: JSON.stringify(todos),
            headers: {
              "Content-Type": "application/json",
            },
          };
        }

        if (!isValidObjectId(todoId)) throw new Error("Invalid object id!");

        const todoObjectId = createObjectId(todoId);

        const todo = await Todo.findOne({ _id: todoObjectId });
        if (!todo) throw new Error("todo doesn't exist!");
        return {
          statusCode: 200,
          body: JSON.stringify(todo),
          headers: {
            "Content-Type": "application/json",
          },
        };
      },
      POST: async () => {
        if (todoContent == null) throw new Error("todo contents are required!");

        const todo = await Todo.insertOne({
          content: todoContent,
          isCompleted: !!isTodoCompleted,
          timestamp: Date.now(),
        });

        return {
          statusCode: 201,
          body: JSON.stringify({ message: "todo created successfully!", todo }),
          headers: {
            "Content-Type": "application/json",
          },
        };
      },
      PUT: async () => {
        if (!todoId) throw new Error("provide a todo to update!");

        if (!isValidObjectId(todoId)) throw new Error("Invalid object id!");

        const todoObjectId = createObjectId(todoId);

        if (todoContent == null && isTodoCompleted == null)
          throw new Error("provide some details to update!");

        const result = await Todo.updateOne(
          { _id: todoObjectId },
          { $set: body },
        );

        if (result.modifiedCount === 0) throw new Error("todo not found!");

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "todo updated successfully!" }),
          headers: {
            "Content-Type": "application/json",
          },
        };
      },
      DELETE: async () => {
        if (!todoId) throw new Error("todo id required!");

        if (!isValidObjectId(todoId)) throw new Error("Invalid object id!");

        const todoObjectId = createObjectId(todoId);

        const result = await Todo.deleteOne({ _id: todoObjectId });

        if (result.deletedCount === 0) throw new Error("todo doesn't exist!");

        return {
          statusCode: 200,
          body: JSON.stringify({ message: "todo deleted successfully" }),
          headers: {
            "Content-Type": "application/json",
          },
        };
      },
    };

    const handler = handlers[httpMethod];
    if (!handler) {
      throw new Error("Invalid Http Method!");
    }
    return await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown";

    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    };
  }
};
