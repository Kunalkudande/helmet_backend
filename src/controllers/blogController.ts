import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../types';
import { AppError, NotFoundError } from '../middleware/errorHandler';

/**
 * GET /api/blog
 * Get all published blog posts (public)
 */
export async function getPublishedPosts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 12));
    const category = req.query.category as string;
    const tag = req.query.tag as string;

    const where: any = { isPublished: true };
    if (category) where.category = category;
    if (tag) where.tags = { has: tag };

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          author: true,
          tags: true,
          category: true,
          publishedAt: true,
          views: true,
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.blogPost.count({ where }),
    ]);

    res.json({
      success: true,
      data: posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/blog/:slug
 * Get a single published blog post by slug (public)
 */
export async function getPostBySlug(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { slug } = req.params;

    const post = await prisma.blogPost.findUnique({
      where: { slug },
    });

    if (!post || !post.isPublished) {
      throw new NotFoundError('Blog post');
    }

    // Increment views
    await prisma.blogPost.update({
      where: { id: post.id },
      data: { views: { increment: 1 } },
    });

    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/blog
 * Get all blog posts (admin)
 */
export async function getAllPosts(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const posts = await prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/blog/:id
 * Get a single blog post by id (admin)
 */
export async function getPostById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const post = await prisma.blogPost.findUnique({
      where: { id: req.params.id },
    });

    if (!post) throw new NotFoundError('Blog post');

    res.json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/blog
 * Create a blog post (admin)
 */
export async function createPost(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { title, slug, excerpt, content, coverImage, author, tags, category, isPublished, metaTitle, metaDesc } = req.body;

    // Generate slug from title if not provided
    const postSlug = slug || title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for duplicate slug
    const existing = await prisma.blogPost.findUnique({ where: { slug: postSlug } });
    if (existing) {
      throw new AppError('A blog post with this slug already exists', 409);
    }

    const post = await prisma.blogPost.create({
      data: {
        title,
        slug: postSlug,
        excerpt,
        content,
        coverImage: coverImage || null,
        author: author || 'Admin',
        tags: tags || [],
        category: category || 'General',
        isPublished: isPublished || false,
        publishedAt: isPublished ? new Date() : null,
        metaTitle: metaTitle || title,
        metaDesc: metaDesc || excerpt,
      },
    });

    res.status(201).json({
      success: true,
      data: post,
      message: 'Blog post created',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/admin/blog/:id
 * Update a blog post (admin)
 */
export async function updatePost(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { title, slug, excerpt, content, coverImage, author, tags, category, isPublished, metaTitle, metaDesc } = req.body;

    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Blog post');

    // If publishing for the first time, set publishedAt
    const publishedAt = isPublished && !existing.isPublished ? new Date() : existing.publishedAt;

    const post = await prisma.blogPost.update({
      where: { id },
      data: {
        title,
        slug,
        excerpt,
        content,
        coverImage,
        author,
        tags,
        category,
        isPublished,
        publishedAt,
        metaTitle,
        metaDesc,
      },
    });

    res.json({
      success: true,
      data: post,
      message: 'Blog post updated',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/admin/blog/:id
 * Delete a blog post (admin)
 */
export async function deletePost(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await prisma.blogPost.delete({
      where: { id: req.params.id },
    });

    res.json({
      success: true,
      data: null,
      message: 'Blog post deleted',
    });
  } catch (error) {
    next(error);
  }
}
