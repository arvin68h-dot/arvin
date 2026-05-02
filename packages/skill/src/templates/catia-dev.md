---
name: catia-dev
description: CATIA development skill for CAD/CAM/CAE development, automation, and V5 API programming
category: development
tags: [catia, cad, cam, cae, automation, v5, api]
---

# CATIA Development Skill

This skill provides CATIA (Computer Aided Three-dimensional Interactive Application) development expertise.

## Usage

When working with CATIA-related development tasks, follow these guidelines.

## CATIA Development Areas

### V5 API Programming
- Use CATScript, CATVBA, or C++ for automation
- Work with the CAA V5 framework
- Implement products and documents interfaces

### Automation
- Automate part creation and assembly operations
- Implement parametric design patterns
- Create custom tools and scripts

### CAD/CAM/CAE
- Understand part modeling (PartDesign, SurfaceDesign)
- Assembly design principles
- Drawing generation and customization
- NC machinining programming support

## Best Practices

### Script Development
- Use proper exception handling with CATBaseUnknown::SafeQueryInterface
- Implement proper memory management
- Use CATBaseUnknown::SafeQueryInterface for safe interface queries
- Follow naming conventions: m_ for member variables

### Performance
- Batch operations when possible
- Use CATMath library for geometric calculations
- Cache frequently accessed data
- Minimize screen refreshes during operations

### Code Structure
- Separate UI logic from business logic
- Use factory patterns for object creation
- Implement proper error reporting
- Add comprehensive logging

## Common Tasks
- Creating parts and assemblies programmatically
- Extracting geometric information
- Modifying parameters and constraints
- Generating drawings from parts
- Customizing the CATIA interface
- Data exchange with external systems
