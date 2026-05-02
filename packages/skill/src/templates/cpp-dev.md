---
name: cpp-dev
description: C++ development skill with focus on modern C++ standards, performance optimization, and cross-platform development
category: development
tags: [cpp, c-plus-plus, development, performance]
---

# C++ Development Skill

This skill provides C++ development expertise.

## Usage

When working with C++ code, follow C++ best practices and modern standards.

## C++ Guidelines

### Standards
- Use C++17 or C++20 when available
- Prefer modern C++ features over C-style patterns
- Use std::string_view for read-only string parameters

### Best Practices
- Use RAII for resource management
- Prefer smart pointers over raw pointers
- Use constexpr where possible
- Apply const correctness
- Use override/final on virtual functions

### Performance
- Minimize unnecessary allocations
- Use move semantics
- Prefer pass-by-const-reference for large objects
- Use reserve() for containers when size is known

### Code Style
- Follow Google C++ Style Guide or project conventions
- Use consistent formatting
- Write meaningful comments for complex logic
- Include header guards and include-what-you-use

## Compilation
- Use proper compiler flags: -Wall -Wextra -Wpedantic
- Enable sanitizers during development: -fsanitize=address,undefined
- Use CMake for build configuration
