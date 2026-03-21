import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createSchemaFactory } from "drizzle-zod";
import { z } from "zod";

// System health check table (DO NOT MODIFY)
export const healthCheck = pgTable("health_check", {
  id: integer("id").primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// User table for simple identification
export const users = pgTable(
  "users",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    nickname: varchar("nickname", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  }
);

// Analysis records - main content storage
export const analysisRecords = pgTable(
  "analysis_records",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 }).notNull(),
    
    // Input content
    inputText: text("input_text").notNull(), // Original input text
    inputType: varchar("input_type", { length: 20 }).notNull().default("text"), // text, image, voice
    
    // AI Analysis result (stored as JSON)
    technicalPoints: jsonb("technical_points"), // Technical concept breakdown
    intentAnalysis: jsonb("intent_analysis"), // Developer intent analysis
    responseScripts: jsonb("response_scripts"), // Suggested response scripts
    followUpQuestions: jsonb("follow_up_questions"), // Questions to ask back
    knowledgeExtension: jsonb("knowledge_extension"), // Extended knowledge
    
    // Metadata
    title: varchar("title", { length: 200 }), // Auto-generated or user-defined title
    summary: text("summary"), // Brief summary
    mode: varchar("mode", { length: 20 }).default("concise"), // concise, detailed
    
    // Status
    isFavorite: boolean("is_favorite").default(false),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("analysis_records_user_id_idx").on(table.userId),
    index("analysis_records_created_at_idx").on(table.createdAt),
  ]
);

// Tags table
export const tags = pgTable(
  "tags",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 50 }).notNull(),
    color: varchar("color", { length: 20 }).default("#6366f1"), // Tag color
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tags_user_id_idx").on(table.userId),
  ]
);

// Record-Tag relationship table
export const recordTags = pgTable(
  "record_tags",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    recordId: varchar("record_id", { length: 36 }).notNull(),
    tagId: varchar("tag_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("record_tags_record_id_idx").on(table.recordId),
    index("record_tags_tag_id_idx").on(table.tagId),
  ]
);

// Zod schemas for validation
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true },
});

// User schemas
export const insertUserSchema = createCoercedInsertSchema(users).pick({
  nickname: true,
});

export const updateUserSchema = createCoercedInsertSchema(users)
  .pick({
    nickname: true,
  })
  .partial();

// Analysis record schemas
export const insertAnalysisRecordSchema = createCoercedInsertSchema(analysisRecords).pick({
  userId: true,
  inputText: true,
  inputType: true,
  title: true,
  summary: true,
  mode: true,
});

export const updateAnalysisRecordSchema = createCoercedInsertSchema(analysisRecords)
  .pick({
    title: true,
    summary: true,
    mode: true,
    isFavorite: true,
    technicalPoints: true,
    intentAnalysis: true,
    responseScripts: true,
    followUpQuestions: true,
    knowledgeExtension: true,
  })
  .partial();

// Tag schemas
export const insertTagSchema = createCoercedInsertSchema(tags).pick({
  userId: true,
  name: true,
  color: true,
});

export const updateTagSchema = createCoercedInsertSchema(tags)
  .pick({
    name: true,
    color: true,
  })
  .partial();

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;

export type AnalysisRecord = typeof analysisRecords.$inferSelect;
export type InsertAnalysisRecord = z.infer<typeof insertAnalysisRecordSchema>;
export type UpdateAnalysisRecord = z.infer<typeof updateAnalysisRecordSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;

export type RecordTag = typeof recordTags.$inferSelect;
