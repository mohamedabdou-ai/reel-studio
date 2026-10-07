import {z} from "zod";


export const HANDLE_PATTERN=/^@[A-Za-z0-9_.]{1,30}$/;
export const creatorEndingSchema=z.object({
  cta:z.string().min(1).max(20).regex(/\S/).nullable(),
  followCard:z.boolean(),
  signOff:z.string().min(1).max(60).regex(/\S/).nullable(),
}).strict();
export const creatorSchema=z.object({
  displayName:z.string().min(1).max(80).regex(/\S/),
  handle:z.string().regex(HANDLE_PATTERN).nullable(),
  ending:creatorEndingSchema,
}).strict().refine(creator=>!creator.ending.followCard || creator.handle!==null,{message:"A follow card needs the creator handle."});
export type Creator=z.infer<typeof creatorSchema>;
